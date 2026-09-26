import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleProduct } from "@/app/admin/productos/actions";
import { ProductForm } from "@/app/admin/productos/product-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catCategoriasProductos, catUnidadesMedida, productos } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const TIPO_LABEL: Record<string, string> = { producto: "Producto", insumo: "Insumo", ambos: "Ambos" };

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const tipo = firstParam(params.tipo) ?? "";
  const categoriaId = firstParam(params.categoriaId) ?? "";
  const estado = firstParam(params.estado) ?? "";

  const filters = [eq(productos.organizacionId, organizationId)];
  if (query) filters.push(or(ilike(productos.nombre, `%${query}%`), ilike(productos.sku, `%${query}%`), ilike(productos.codigoBarras, `%${query}%`))!);
  if (tipo === "producto" || tipo === "insumo" || tipo === "ambos") filters.push(eq(productos.tipo, tipo));
  if (categoriaId) filters.push(eq(productos.categoriaId, categoriaId));
  if (estado === "activo") filters.push(eq(productos.activo, true));
  if (estado === "oculto") filters.push(eq(productos.activo, false));

  const [categories, units, productRows] = await Promise.all([
    db
      .select({ id: catCategoriasProductos.id, nombre: catCategoriasProductos.nombre })
      .from(catCategoriasProductos)
      .where(and(eq(catCategoriasProductos.organizacionId, organizationId), eq(catCategoriasProductos.activo, true)))
      .orderBy(asc(catCategoriasProductos.nombre)),
    db
      .select({ id: catUnidadesMedida.id, nombre: catUnidadesMedida.nombre })
      .from(catUnidadesMedida)
      .where(and(eq(catUnidadesMedida.organizacionId, organizationId), eq(catUnidadesMedida.activo, true)))
      .orderBy(asc(catUnidadesMedida.nombre)),
    db
      .select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, tipo: productos.tipo, costo: productos.costo, precioVenta: productos.precioVenta, activo: productos.activo })
      .from(productos)
      .where(and(...filters))
      .orderBy(desc(productos.createdAt))
      .limit(100),
  ]);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select().from(productos).where(and(eq(productos.id, editId), eq(productos.organizacionId, organizationId))).limit(1))[0]
    : undefined;
  const editingData = editing
    ? {
        id: editing.id,
        organizacionId: editing.organizacionId,
        categoriaId: editing.categoriaId,
        unidadMedidaId: editing.unidadMedidaId,
        sku: editing.sku,
        codigoBarras: editing.codigoBarras,
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        tipo: editing.tipo,
        costo: editing.costo,
        precioVenta: editing.precioVenta,
        stockMinimo: editing.stockMinimo,
        visiblePos: editing.visiblePos,
      }
    : undefined;

  const preserved = { q: query || null, tipo: tipo || null, categoriaId: categoriaId || null, estado: estado || null };
  const hasFilters = Boolean(query || tipo || categoriaId || estado);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-productos", { organizationId })} />} variant="outline">
              Categorías
            </Button>
            <Button nativeButton={false} render={<Link href={buildAdminHref("/unidades-medida", { organizationId })} />} variant="outline">
              Unidades
            </Button>
          </>
        }
        description="Productos vendibles e insumos consumidos por los servicios."
        title="Productos e insumos"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-56 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre, SKU o código de barras" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Tipo</FieldLabel>
          <Select defaultValue={tipo} name="tipo">
            <option value="">Todos</option>
            <option value="producto">Producto</option>
            <option value="insumo">Insumo</option>
            <option value="ambos">Ambos</option>
          </Select>
        </Field>
        <Field className="w-48">
          <FieldLabel>Categoría</FieldLabel>
          <Select defaultValue={categoriaId} name="categoriaId">
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="w-40">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="oculto">Ocultos</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
        {hasFilters ? (
          <Button nativeButton={false} render={<Link href={buildAdminHref("/productos", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Filtros activos:</span>
          {query ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Búsqueda: {query}</span> : null}
          {tipo ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Tipo: {TIPO_LABEL[tipo] ?? tipo}</span> : null}
          {categoriaId ? (
            <span className="rounded-full bg-muted/60 px-2.5 py-1">
              Categoría: {categories.find((category) => category.id === categoriaId)?.nombre ?? categoriaId}
            </span>
          ) : null}
          {estado ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Estado: {estado}</span> : null}
        </div>
      ) : null}

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.productos.nuevo"
            nativeButton={false}
            render={<Link href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${productRows.length} resultado(s)`}
        title="Productos registrados"
      >
        {productRows.length === 0 ? (
          <EmptyState description="Registra productos que vendes e insumos que consumes en los servicios." title="No hay productos" />
        ) : (
          <>
            <RegistroList>
              {productRows.map((product) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
                        href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, edit: product.id } })}
                      >
                        Editar
                      </Link>
                      <form action={toggleProduct}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={product.id} />
                        <input name="activo" type="hidden" value={String(product.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">
                          {product.activo ? "Ocultar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={product.activo} />}
                  campos={[
                    { label: "Tipo", value: TIPO_LABEL[product.tipo] ?? product.tipo },
                    { label: "Costo", value: formatCurrency(product.costo, { currency: context.currency }) },
                    { label: "Precio", value: formatCurrency(product.precioVenta, { currency: context.currency }) },
                  ]}
                  key={product.id}
                  subtitulo={<span className="font-mono">{product.sku}</span>}
                  titulo={product.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">SKU</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Costo</th>
                    <th className="py-2 pr-4 font-medium">Precio</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((product) => (
                    <tr className="border-b border-border" key={product.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{product.sku}</td>
                      <td className="py-3 pr-4 font-medium">{product.nombre}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">{TIPO_LABEL[product.tipo] ?? product.tipo}</span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(product.costo, { currency: context.currency })}</td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(product.precioVenta, { currency: context.currency })}</td>
                      <td className="py-3 pr-4"><StatusBadge active={product.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
                            href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, edit: product.id } })}
                          >
                            Editar
                          </Link>
                          <form action={toggleProduct}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={product.id} />
                            <input name="activo" type="hidden" value={String(product.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">
                              {product.activo ? "Ocultar" : "Activar"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/productos", { organizationId, extra: preserved })}
          description={editing ? "Ajusta los datos del producto o insumo." : "Registra un producto vendible o un insumo."}
          title={editing ? "Editar producto" : "Nuevo producto"}
          wide
        >
          <ProductForm categories={categories} initial={editingData} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} units={units} />
        </FormSheet>
      ) : null}
    </div>
  );
}
