import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { CobroForm } from "@/app/admin/pos/cobro-form";
import { getDatabase } from "@/db/client";
import { citas, detalleCitasServicios } from "@/db/schema/operations";
import { catMediosPago, servicios } from "@/db/schema/catalogs";
import { clientes } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; citaId?: string }>;

export default async function PosPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizationId = params.organizationId;
  const citaId = params.citaId;
  if (!organizationId || !citaId) notFound();
  await requireOrganizationAccess(organizationId);

  const [cita] = await db.select({
    id: citas.id,
    estado: citas.estado,
    clienteNombre: clientes.nombre,
  }).from(citas).leftJoin(clientes, eq(citas.clienteId, clientes.id)).where(and(eq(citas.id, citaId), eq(citas.organizacionId, organizationId))).limit(1);
  if (!cita) notFound();

  const [serviciosCita, mediosPago] = await Promise.all([
    db.select({ id: detalleCitasServicios.id, nombre: servicios.nombre, precio: detalleCitasServicios.precio, duracionMinutos: servicios.duracionMinutos })
      .from(detalleCitasServicios)
      .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
      .where(and(eq(detalleCitasServicios.citaId, citaId), eq(detalleCitasServicios.activo, true))),
    db.select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria }).from(catMediosPago).where(and(eq(catMediosPago.organizacionId, organizationId), eq(catMediosPago.activo, true))).orderBy(asc(catMediosPago.nombre)),
  ]);

  const total = serviciosCita.reduce((sum, s) => sum + parseFloat(s.precio), 0);

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div><Link className="text-sm text-[#8a5140]" href={`/admin/agenda?organizationId=${organizationId}`}>← Agenda</Link><h1 className="mt-2 text-2xl font-semibold">Punto de venta</h1></div>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-6 py-10 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Resumen de la cita</h2>
            <p className="mt-1 text-sm text-[#625b55]">Cliente: {cita.clienteNombre ?? "Walk-in"} · Estado: {cita.estado}</p>
            <div className="mt-5 space-y-2">
              {serviciosCita.length === 0 ? (
                <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">Esta cita no tiene servicios registrados.</p>
              ) : (
                serviciosCita.map((s) => (
                  <div className="flex items-center justify-between rounded-xl border border-[#eee8e3] px-4 py-3 text-sm" key={s.id}>
                    <span>{s.nombre}</span>
                    <span className="tabular-nums">${s.precio}</span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f2e3dc] px-4 py-3">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold tabular-nums text-[#8a5140]">${total.toFixed(2)}</span>
            </div>
            <Link className="mt-4 inline-block text-sm text-[#8a5140]" href={`/admin/agenda?organizationId=${organizationId}`}>← Volver a la agenda</Link>
          </section>
          <section>
            <CobroForm citaId={cita.id} mediosPago={medios} organizacionId={organizationId} requiereReferencia={mediosPago.length > 0} />
          </section>
        </div>
      </section>
    </main>
  );
}
