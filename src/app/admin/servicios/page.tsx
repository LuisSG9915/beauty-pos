import Link from "next/link";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { ServiceForm } from "@/app/admin/servicios/service-form";
import { toggleService } from "@/app/admin/servicios/actions";
import { InsumosManager } from "@/app/admin/servicios/insumos-manager";
import { ComisionesManager } from "@/app/admin/servicios/comisiones-manager";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catCategoriasServicios, comisiones, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { catUnidadesMedida } from "@/db/schema/catalogs";
import { catRoles } from "@/db/schema/access";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; q?: string; edit?: string }>;

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((organization) => organization.id === params.organizationId) ? params.organizationId : organizations[0]?.id;

  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Servicios</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);
  const query = params.q?.trim() ?? "";
  const filters = [eq(servicios.organizacionId, organizationId)];
  if (query) filters.push(ilike(servicios.nombre, `%${query}%`));

  const [categories, serviceRows, roles] = await Promise.all([
    db.select({ id: catCategoriasServicios.id, nombre: catCategoriasServicios.nombre }).from(catCategoriasServicios).where(and(eq(catCategoriasServicios.organizacionId, organizationId), eq(catCategoriasServicios.activo, true))).orderBy(asc(catCategoriasServicios.nombre)),
    db.select({ id: servicios.id, clave: servicios.clave, nombre: servicios.nombre, duracionMinutos: servicios.duracionMinutos, precioBase: servicios.precioBase, activo: servicios.activo, categoriaId: servicios.categoriaId }).from(servicios).where(and(...filters)).orderBy(desc(servicios.createdAt)).limit(100),
    db.select({ id: catRoles.id, nombre: catRoles.nombre }).from(catRoles).where(and(eq(catRoles.organizacionId, organizationId), eq(catRoles.activo, true))).orderBy(asc(catRoles.nombre)),
  ]);

  const editing = params.edit ? (await db.select().from(servicios).where(and(eq(servicios.id, params.edit), eq(servicios.organizacionId, organizationId))).limit(1))[0] : undefined;

  let insumosData: Array<{ id: string; productoId: string; productoNombre: string; productoSku: string; cantidad: string; unidadNombre: string | null }> = [];
  let insumosDisponibles: Array<{ id: string; sku: string; nombre: string; unidadNombre: string | null }> = [];
  let comisionesData: Array<{ id: string; tipo: string; valor: string; rolNombre: string | null }> = [];

  if (editing) {
    [insumosData, insumosDisponibles, comisionesData] = await Promise.all([
      db.select({
        id: relServiciosInsumos.id,
        productoId: relServiciosInsumos.productoId,
        productoNombre: productos.nombre,
        productoSku: productos.sku,
        cantidad: relServiciosInsumos.cantidad,
        unidadNombre: catUnidadesMedida.nombre,
      })
        .from(relServiciosInsumos)
        .innerJoin(productos, eq(relServiciosInsumos.productoId, productos.id))
        .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
        .where(and(eq(relServiciosInsumos.servicioId, editing.id), eq(relServiciosInsumos.activo, true))),
      db.select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, unidadNombre: catUnidadesMedida.nombre })
        .from(productos)
        .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
        .where(and(eq(productos.organizacionId, organizationId), eq(productos.activo, true), or(eq(productos.tipo, "insumo"), eq(productos.tipo, "ambos"))))
        .orderBy(asc(productos.nombre)),
      db.select({ id: comisiones.id, tipo: comisiones.tipo, valor: comisiones.valor, rolNombre: catRoles.nombre })
        .from(comisiones)
        .leftJoin(catRoles, eq(comisiones.rolId, catRoles.id))
        .where(and(eq(comisiones.servicioId, editing.id), eq(comisiones.activo, true))),
    ]);
  }

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div><Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link><h1 className="mt-2 text-2xl font-semibold">Servicios</h1></div>
          <span className="text-sm text-[#625b55]">{organizations.find((organization) => organization.id === organizationId)?.nombre}</span>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/servicios?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>)}
        </div>
        <form className="mb-6 flex gap-3 rounded-2xl border border-[#ded8d2] bg-white p-4" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input className="h-10 flex-1 rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={query} name="q" placeholder="Buscar servicio" />
          <button className="rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white" type="submit">Buscar</button>
        </form>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-6">
            <ServiceForm categories={categories} initial={editing} organizationId={organizationId} />
            {editing && <InsumosManager organizationId={organizationId} servicioId={editing.id} insumos={insumosData} disponibles={insumosDisponibles} />}
            {editing && <ComisionesManager organizationId={organizationId} servicioId={editing.id} comisiones={comisionesData} roles={roles} />}
          </div>
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div><h2 className="font-semibold">Servicios registrados</h2><p className="mt-1 text-sm text-[#625b55]">{serviceRows.length} resultado(s)</p></div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/servicios?organizationId=${organizationId}`}>Nuevo</Link>
            </div>
            {serviceRows.length === 0 ? (
              <div className="mt-5"><EmptyState description="Crea servicios para el salón: cortes, tratamientos, manicure, etc." title="No hay servicios" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">Clave</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Duración</th>
                      <th className="py-2 pr-4">Precio</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceRows.map((service) => (
                      <tr className="border-b border-[#f1eeea]" key={service.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{service.clave}</td>
                        <td className="py-3 pr-4 font-medium">{service.nombre}</td>
                        <td className="py-3 pr-4 text-xs text-[#625b55]">{service.duracionMinutos} min</td>
                        <td className="py-3 pr-4 tabular-nums">${service.precioBase}</td>
                        <td className="py-3 pr-4"><StatusBadge active={service.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={`/admin/servicios?organizationId=${organizationId}&edit=${service.id}`}>Editar</Link>
                            <form action={toggleService}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={service.id} />
                              <input name="activo" type="hidden" value={String(service.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{service.activo ? "Ocultar" : "Activar"}</button>
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
