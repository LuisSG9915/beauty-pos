import Link from "next/link";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { ProductForm } from "@/app/admin/productos/product-form";
import { toggleProduct } from "@/app/admin/productos/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catCategoriasProductos, catUnidadesMedida, productos } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; q?: string; tipo?: string; categoriaId?: string; estado?: string; edit?: string }>;

const TIPO_LABEL: Record<string, string> = { producto: "Producto", insumo: "Insumo", ambos: "Ambos" };

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((organization) => organization.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Productos e insumos</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);

  const query = params.q?.trim() ?? "";
  const tipo = params.tipo ?? "";
  const categoriaId = params.categoriaId ?? "";
  const estado = params.estado ?? "";

  const filters = [eq(productos.organizacionId, organizationId)];
  if (query) filters.push(or(ilike(productos.nombre, `%${query}%`), ilike(productos.sku, `%${query}%`), ilike(productos.codigoBarras, `%${query}%`))!);
  if (tipo) filters.push(eq(productos.tipo, tipo as "producto" | "insumo" | "ambos"));
  if (categoriaId) filters.push(eq(productos.categoriaId, categoriaId));
  if (estado === "activo") filters.push(eq(productos.activo, true));
  if (estado === "oculto") filters.push(eq(productos.activo, false));

  const [categories, units, productRows] = await Promise.all([
    db.select({ id: catCategoriasProductos.id, nombre: catCategoriasProductos.nombre }).from(catCategoriasProductos).where(and(eq(catCategoriasProductos.organizacionId, organizationId), eq(catCategoriasProductos.activo, true))).orderBy(asc(catCategoriasProductos.nombre)),
    db.select({ id: catUnidadesMedida.id, nombre: catUnidadesMedida.nombre }).from(catUnidadesMedida).where(and(eq(catUnidadesMedida.organizacionId, organizationId), eq(catUnidadesMedida.activo, true))).orderBy(asc(catUnidadesMedida.nombre)),
    db.select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, tipo: productos.tipo, costo: productos.costo, precioVenta: productos.precioVenta, activo: productos.activo, categoriaId: productos.categoriaId }).from(productos).where(and(...filters)).orderBy(desc(productos.createdAt)).limit(100),
  ]);

  const editing = params.edit ? (await db.select().from(productos).where(and(eq(productos.id, params.edit), eq(productos.organizacionId, organizationId))).limit(1))[0] : undefined;
  const editingData = editing ? {
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
  } : undefined;

  const filterHref = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams({ organizationId });
    if (query) sp.set("q", query);
    if (tipo) sp.set("tipo", tipo);
    if (categoriaId) sp.set("categoriaId", categoriaId);
    if (estado) sp.set("estado", estado);
    for (const [key, val] of Object.entries(next)) {
      if (val === undefined || val === "") sp.delete(key);
      else sp.set(key, val);
    }
    return `/admin/productos?${sp.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link>
            <h1 className="mt-2 text-2xl font-semibold">Productos e insumos</h1>
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="text-[#8a5140]" href={`/admin/categorias-productos?organizationId=${organizationId}`}>Categorías</Link>
            <Link className="text-[#8a5140]" href={`/admin/unidades-medida?organizationId=${organizationId}`}>Unidades</Link>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => (
            <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/productos?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>
          ))}
        </div>

        <form className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-[#ded8d2] bg-white p-4" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input className="h-10 min-w-[200px] flex-1 rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={query} name="q" placeholder="Buscar por nombre, SKU o código de barras" />
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={tipo} name="tipo">
            <option value="">Todos los tipos</option>
            <option value="producto">Producto</option>
            <option value="insumo">Insumo</option>
            <option value="ambos">Ambos</option>
          </select>
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={categoriaId} name="categoriaId">
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
          </select>
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={estado} name="estado">
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="oculto">Ocultos</option>
          </select>
          <button className="rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white" type="submit">Filtrar</button>
          {(query || tipo || categoriaId || estado) && (
            <Link className="rounded-xl border border-[#ded8d2] px-4 py-2 text-sm text-[#625b55]" href={`/admin/productos?organizationId=${organizationId}`}>Limpiar</Link>
          )}
        </form>

        {(query || tipo || categoriaId || estado) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[#625b55]">
            <span>Filtros activos:</span>
            {query && <span className="rounded-full bg-[#f1eeea] px-2.5 py-1">Búsqueda: {query}</span>}
            {tipo && <span className="rounded-full bg-[#f1eeea] px-2.5 py-1">Tipo: {TIPO_LABEL[tipo] ?? tipo}</span>}
            {categoriaId && <span className="rounded-full bg-[#f1eeea] px-2.5 py-1">Categoría: {categories.find((c) => c.id === categoriaId)?.nombre ?? categoriaId}</span>}
            {estado && <span className="rounded-full bg-[#f1eeea] px-2.5 py-1">Estado: {estado}</span>}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <ProductForm categories={categories} initial={editingData} organizationId={organizationId} units={units} />
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Productos registrados</h2>
                <p className="mt-1 text-sm text-[#625b55]">{productRows.length} resultado(s)</p>
              </div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/productos?organizationId=${organizationId}`}>Nuevo</Link>
            </div>
            {productRows.length === 0 ? (
              <div className="mt-5"><EmptyState description="Registra productos que vendes e insumos que consumes en los servicios." title="No hay productos" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">SKU</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Costo</th>
                      <th className="py-2 pr-4">Precio</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((product) => (
                      <tr className="border-b border-[#f1eeea]" key={product.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{product.sku}</td>
                        <td className="py-3 pr-4 font-medium">{product.nombre}</td>
                        <td className="py-3 pr-4"><span className="rounded-full bg-[#f1eeea] px-2.5 py-1 text-xs text-[#625b55]">{TIPO_LABEL[product.tipo] ?? product.tipo}</span></td>
                        <td className="py-3 pr-4 tabular-nums">${product.costo}</td>
                        <td className="py-3 pr-4 tabular-nums">${product.precioVenta}</td>
                        <td className="py-3 pr-4"><StatusBadge active={product.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={filterHref({ edit: product.id })}>Editar</Link>
                            <form action={toggleProduct}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={product.id} />
                              <input name="activo" type="hidden" value={String(product.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{product.activo ? "Ocultar" : "Activar"}</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
