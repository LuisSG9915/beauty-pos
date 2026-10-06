import { and, asc, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleProduct } from "@/app/admin/productos/actions";
import { ProductForm } from "@/app/admin/productos/product-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { ToggleActivo } from "@/components/admin/toggle-activo";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catCategoriasProductos, catUnidadesMedida, productos } from "@/db/schema/catalogs";
import { compras, detalleCompras, proveedores } from "@/db/schema/compras";
import { medios } from "@/db/schema/media";
import { inventarioStock } from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { getAi } from "@/lib/ia/cliente";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const TIPO_LABEL: Record<string, string> = { producto: "Producto", insumo: "Insumo", ambos: "Ambos" };

/** Margen sobre el precio de venta ((precio - costo) / precio) en porcentaje. */
function margenPorcentaje(costo: string, precioVenta: string): number | null {
  const precio = Number(precioVenta);
  if (!Number.isFinite(precio) || precio <= 0) return null;
  return ((precio - Number(costo)) / precio) * 100;
}

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
      .select({
        id: productos.id,
        sku: productos.sku,
        nombre: productos.nombre,
        tipo: productos.tipo,
        categoriaNombre: catCategoriasProductos.nombre,
        costo: productos.costo,
        precioVenta: productos.precioVenta,
        visiblePos: productos.visiblePos,
        activo: productos.activo,
        // Stock de la organización entera (todas las sucursales) como
        // subselect escalar: una sola ronda a la BD por página, sin N+1.
        stockTotal: sql<string>`(
          select coalesce(sum(${inventarioStock.stockActual}), 0)
            from ${inventarioStock}
           where ${inventarioStock.organizacionId} = ${organizationId}
             and ${inventarioStock.productoId} = ${productos.id}
        )`,
      })
      .from(productos)
      .leftJoin(catCategoriasProductos, eq(productos.categoriaId, catCategoriasProductos.id))
      .where(and(...filters))
      .orderBy(desc(productos.createdAt))
      .limit(100),
  ]);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db
        .select({ ...getTableColumns(productos), imagenClaveR2: medios.claveR2 })
        .from(productos)
        .leftJoin(medios, eq(productos.imagenPrincipalId, medios.id))
        .where(and(eq(productos.id, editId), eq(productos.organizacionId, organizationId)))
        .limit(1))[0]
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
        imagenClaveR2: editing.imagenClaveR2,
      }
    : undefined;

  // Plan 10 — "Últimas compras" del producto: 5 líneas recibidas de compras
  // ya verificadas, con proveedor, fecha y costo pagado.
  const ultimasCompras = editing
    ? (
        await db
          .select({
            proveedorNombre: proveedores.nombre,
            proveedorTexto: compras.proveedorTexto,
            fechaCompra: compras.fechaCompra,
            recibidaAt: compras.recibidaAt,
            cantidadRecibida: detalleCompras.cantidadRecibida,
            cantidad: detalleCompras.cantidad,
            costoUnitario: detalleCompras.costoUnitario,
          })
          .from(detalleCompras)
          .innerJoin(compras, eq(detalleCompras.compraId, compras.id))
          .leftJoin(proveedores, eq(compras.proveedorId, proveedores.id))
          .where(
            and(
              eq(detalleCompras.productoId, editing.id),
              eq(detalleCompras.organizacionId, organizationId),
              eq(detalleCompras.activo, true),
              eq(compras.activo, true),
              eq(compras.estado, "verificada"),
            ),
          )
          .orderBy(desc(compras.recibidaAt), desc(compras.fechaCompra))
          .limit(5)
      ).map((fila) => ({
        proveedor: fila.proveedorNombre ?? fila.proveedorTexto ?? "Sin proveedor",
        fecha: formatDate(fila.fechaCompra ?? fila.recibidaAt, { timeZone: context.timeZone }),
        cantidad: formatQuantity(fila.cantidadRecibida ?? fila.cantidad),
        costo: formatCurrency(fila.costoUnitario, { currency: context.currency }),
      }))
    : [];

  const preserved = { q: query || null, tipo: tipo || null, categoriaId: categoriaId || null, estado: estado || null };
  const hasFilters = Boolean(query || tipo || categoriaId || estado);

  type ProductRow = (typeof productRows)[number];
  const columns: Array<DataTableColumn<ProductRow>> = [
    {
      id: "clave",
      header: "Clave",
      cell: (product) => <span className="font-mono text-xs">{product.sku}</span>,
    },
    { id: "nombre", header: "Nombre", cell: (product) => <span className="font-medium">{product.nombre}</span> },
    {
      id: "categoria",
      header: "Categoría",
      cell: (product) => product.categoriaNombre ?? <span className="text-muted-foreground">—</span>,
      hideBelow: "xl",
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: (product) => (
        <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
          {TIPO_LABEL[product.tipo] ?? product.tipo}
        </span>
      ),
      hideBelow: "lg",
    },
    {
      id: "costo",
      header: "Costo",
      cell: (product) => <span className="tabular-nums">{formatCurrency(product.costo, { currency: context.currency })}</span>,
      align: "right",
      hideBelow: "lg",
    },
    {
      id: "precio",
      header: "Precio",
      cell: (product) => <span className="tabular-nums">{formatCurrency(product.precioVenta, { currency: context.currency })}</span>,
      align: "right",
    },
    {
      id: "margen",
      header: "Margen",
      cell: (product) => {
        const margen = margenPorcentaje(product.costo, product.precioVenta);
        return margen === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{Math.round(margen)}%</span>
        );
      },
      align: "right",
      hideBelow: "lg",
    },
    {
      id: "stock",
      header: "Stock total",
      cell: (product) => <span className="tabular-nums">{formatQuantity(product.stockTotal)}</span>,
      align: "right",
    },
    {
      id: "pos",
      header: "En POS",
      cell: (product) =>
        product.visiblePos ? "Sí" : <span className="text-muted-foreground">No</span>,
      hideBelow: "xl",
    },
    { id: "estado", header: "Estado", cell: (product) => <StatusBadge active={product.activo} /> },
    {
      id: "acciones",
      header: "Acciones",
      cell: (product) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
            href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, edit: product.id } })}
          >
            Editar
          </Link>
          <ToggleActivo
            action={toggleProduct}
            activo={product.activo}
            confirmHint="Dejará de aparecer en el punto de venta."
            entidad="producto"
            id={product.id}
            nombre={product.nombre}
            organizationId={organizationId}
            telemetryBase="catalogo.productos"
          />
        </div>
      ),
      align: "right",
      stickyEnd: true,
    },
  ];

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
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre, clave o código de barras" />
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
                      <ToggleActivo
                        action={toggleProduct}
                        activo={product.activo}
                        confirmHint="Dejará de aparecer en el punto de venta."
                        entidad="producto"
                        id={product.id}
                        nombre={product.nombre}
                        organizationId={organizationId}
                        telemetryBase="catalogo.productos"
                      />
                    </div>
                  }
                  badge={<StatusBadge active={product.activo} />}
                  campos={[
                    { label: "Tipo", value: TIPO_LABEL[product.tipo] ?? product.tipo },
                    ...(product.categoriaNombre ? [{ label: "Categoría", value: product.categoriaNombre }] : []),
                    { label: "Costo", value: formatCurrency(product.costo, { currency: context.currency }) },
                    { label: "Precio", value: formatCurrency(product.precioVenta, { currency: context.currency }) },
                    ...(margenPorcentaje(product.costo, product.precioVenta) !== null
                      ? [{ label: "Margen", value: `${Math.round(margenPorcentaje(product.costo, product.precioVenta)!)}%` }]
                      : []),
                    { label: "Stock total", value: formatQuantity(product.stockTotal) },
                    { label: "En el punto de venta", value: product.visiblePos ? "Sí" : "No" },
                  ]}
                  key={product.id}
                  subtitulo={<span className="font-mono">{product.sku}</span>}
                  titulo={product.nombre}
                />
              ))}
            </RegistroList>
            <DataTable
              className="hidden md:block"
              columns={columns}
              minWidth="980px"
              rowKey={(product) => product.id}
              rows={productRows}
            />
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
          <ProductForm capturaIa={Boolean(getAi())} categories={categories} initial={editingData} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} ultimasCompras={ultimasCompras} units={units} />
        </FormSheet>
      ) : null}
    </div>
  );
}
