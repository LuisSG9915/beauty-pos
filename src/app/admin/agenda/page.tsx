import Link from "next/link";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { AgendaBoard, type AgendaCita } from "@/app/admin/agenda/agenda-board";
import { AdminNavCompact } from "@/components/admin-nav";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { citas, detalleCitasServicios } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { clientes, miembrosOrganizaciones, organizaciones, sucursales, usuarios } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; fecha?: string; sucursalId?: string }>;

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((organization) => organization.id === params.organizationId) ? params.organizationId : organizations[0]?.id;

  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Agenda</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);

  const fecha = params.fecha ?? new Date().toLocaleDateString("en-CA");
  const [branches, staff, clientRows, serviceRows] = await Promise.all([
    db.select({ id: sucursales.id, nombre: sucursales.nombre, clave: sucursales.clave }).from(sucursales).where(and(eq(sucursales.organizacionId, organizationId), eq(sucursales.activo, true))).orderBy(asc(sucursales.nombre)),
    db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(miembrosOrganizaciones).innerJoin(usuarios, eq(miembrosOrganizaciones.usuarioId, usuarios.id)).where(and(eq(miembrosOrganizaciones.organizacionId, organizationId), eq(miembrosOrganizaciones.estado, "activo"))).orderBy(asc(usuarios.nombre)),
    db.select({ id: clientes.id, nombre: clientes.nombre, telefono: clientes.telefono }).from(clientes).where(and(eq(clientes.organizacionId, organizationId), eq(clientes.activo, true))).orderBy(asc(clientes.nombre)),
    db.select({ id: servicios.id, nombre: servicios.nombre, precioBase: servicios.precioBase, duracionMinutos: servicios.duracionMinutos }).from(servicios).where(and(eq(servicios.organizacionId, organizationId), eq(servicios.activo, true))).orderBy(asc(servicios.nombre)),
  ]);

  const sucursalId = params.sucursalId && branches.some((b) => b.id === params.sucursalId) ? params.sucursalId : branches[0]?.id;

  let citaRows: AgendaCita[] = [];
  if (sucursalId) {
    const dayStart = new Date(`${fecha}T00:00:00`);
    const dayEnd = new Date(`${fecha}T23:59:59.999`);
    const rows = await db.select({
      id: citas.id,
      fechaHora: citas.fechaHora,
      duracionMinutos: citas.duracionMinutos,
      estado: citas.estado,
      notas: citas.notas,
      totalEstimado: citas.totalEstimado,
      clienteId: citas.clienteId,
      clienteNombre: clientes.nombre,
      sucursalId: citas.sucursalId,
      usuarioId: citas.usuarioId,
    })
      .from(citas)
      .leftJoin(clientes, eq(citas.clienteId, clientes.id))
      .where(and(eq(citas.organizacionId, organizationId), eq(citas.activo, true), gte(citas.fechaHora, dayStart), lte(citas.fechaHora, dayEnd)))
      .orderBy(asc(citas.fechaHora));

    const citaIds = rows.map((r) => r.id);
    const detalles = citaIds.length > 0
      ? await db.select({ citaId: detalleCitasServicios.citaId, servicioId: detalleCitasServicios.servicioId, nombre: servicios.nombre, precio: detalleCitasServicios.precio })
          .from(detalleCitasServicios)
          .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
          .where(and(inArray(detalleCitasServicios.citaId, citaIds), eq(detalleCitasServicios.activo, true)))
      : [];
    const serviciosPorCita = new Map<string, Array<{ id: string; nombre: string; precio: string }>>();
    for (const d of detalles) {
      if (!serviciosPorCita.has(d.citaId)) serviciosPorCita.set(d.citaId, []);
      serviciosPorCita.get(d.citaId)!.push({ id: d.servicioId, nombre: d.nombre, precio: d.precio });
    }

    citaRows = rows.map((r) => ({
      ...r,
      clienteNombre: r.clienteNombre ?? "Walk-in",
      servicios: serviciosPorCita.get(r.id) ?? [],
    }));
  }

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 lg:px-10">
          <div><Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link><h1 className="mt-2 text-2xl font-semibold">Agenda de citas</h1></div>
          <span className="text-sm text-[#625b55]">{organizations.find((organization) => organization.id === organizationId)?.nombre}</span>
        </div>
      </header>
      <section className="mx-auto max-w-[1400px] px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/agenda?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>)}
        </div>

        {branches.length === 0 ? (
          <EmptyState description="Crea una sucursal para poder agendar citas." title="No hay sucursales" />
        ) : (
          <>
            <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#ded8d2] bg-white p-4" method="get">
              <input name="organizationId" type="hidden" value={organizationId} />
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#625b55]">Fecha</span>
                <input className="h-10 rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={fecha} name="fecha" type="date" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[#625b55]">Sucursal</span>
                <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={sucursalId} name="sucursalId">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select>
              </label>
              <button className="h-10 rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white" type="submit">Ver agenda</button>
            </form>

            <AgendaBoard
              citas={citaRows}
              clientes={clientRows}
              fecha={fecha}
              organizationId={organizationId}
              servicios={serviceRows}
              staff={staff}
              sucursales={branches}
            />
          </>
        )}
      </section>
    </main>
  );
}
