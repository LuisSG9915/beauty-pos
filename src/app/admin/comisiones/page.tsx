import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { LiquidarForm } from "@/app/admin/comisiones/liquidar-form";
import { RevertirLiquidacionForm } from "@/app/admin/comisiones/revertir-liquidacion-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime, todayDateInput } from "@/lib/format";
import { buildAdminHref, normalizeDateInput } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey } from "@/modules/agenda";
import { contextoSuscripcion } from "@/modules/billing/queries";
import { listarComisionesPendientes, listarLiquidaciones } from "@/modules/comisiones/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const ESTADO_LABEL: Record<string, string> = { confirmada: "Confirmada", revertida: "Revertida" };

/** Liquidación de comisiones: pendientes por profesional, pago y historial. */
export default async function ComisionesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, sucursalId, timeZone, currency, access } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();
  requireAccessPermission(access, "comisiones.ver");
  const suscripcion = await contextoSuscripcion(organizationId);
  if (!suscripcion.capacidades.has("comisiones")) {
    return (
      <PlanUpgradeNotice
        capacidad="comisiones"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }
  const puedeEditar = hasPermission(access, "comisiones.editar");

  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) notFound();

  const db = getDatabase();
  const [medios, pendientes, liquidaciones] = await Promise.all([
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, organizationId), eq(catMediosPago.activo, true)))
      .orderBy(asc(catMediosPago.nombre)),
    listarComisionesPendientes(db, {
      organizacionId: organizationId,
      sucursalId,
      iniciaAt: boundsDesde.iniciaAt,
      terminaAt: boundsHasta.terminaAt,
    }),
    listarLiquidaciones(db, { organizacionId: organizationId, sucursalId }),
  ]);

  // Agrupa pendientes por profesional conservando el nombre.
  const porProfesional = new Map<string, { nombre: string; total: number; cantidad: number }>();
  for (const row of pendientes) {
    const actual = porProfesional.get(row.usuarioId) ?? { nombre: row.profesional, total: 0, cantidad: 0 };
    actual.total += Number(row.monto);
    actual.cantidad += 1;
    porProfesional.set(row.usuarioId, actual);
  }
  const resumen = [...porProfesional.entries()]
    .map(([usuarioId, datos]) => ({ usuarioId, ...datos }))
    .sort((a, b) => b.total - a.total);

  const fmt = (v: string | number) => formatCurrency(Number(v), { currency });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · ${desde} → ${hasta}. Las comisiones se devengan al cobrar servicios; aquí se pagan al equipo. En efectivo salen del corte abierto.`}
        title="Comisiones"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <input name="sucursalId" type="hidden" value={sucursalId} />
        <Field className="w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
      </form>

      <AdminCard description="Comisiones devengadas y activas aún sin pagar en el periodo." title="Pendientes por profesional">
        {resumen.length === 0 ? (
          <EmptyState description="No hay comisiones pendientes en este periodo." title="Sin pendientes" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumen.map((item) => (
              <div className="rounded-2xl border border-[#eadfd8] bg-[#faf9f7] p-4" key={item.usuarioId}>
                <p className="font-medium text-[#2d2926]">{item.nombre}</p>
                <p className="mt-1 text-xs text-[#81746c]">{item.cantidad} línea(s) de servicio</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-[#2d2926]">{fmt(item.total)}</p>
                {puedeEditar ? (
                  <div className="mt-3">
                    <LiquidarForm
                      medios={medios}
                      organizationId={organizationId}
                      periodoDesde={desde}
                      periodoHasta={hasta}
                      sucursalId={sucursalId}
                      usuarioId={item.usuarioId}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard description={`${pendientes.length} línea(s) sin liquidar`} title="Detalle de pendientes">
        {pendientes.length === 0 ? (
          <EmptyState description="Cada servicio cobrado con regla de comisión aparece aquí hasta que se liquida." title="Sin líneas" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Cobro</th>
                  <th className="py-2 pr-4 font-medium">Profesional</th>
                  <th className="py-2 pr-4 font-medium">Servicio</th>
                  <th className="py-2 pr-4 text-right font-medium">Base</th>
                  <th className="py-2 text-right font-medium">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((row) => (
                  <tr className="border-b border-[#f1eeea] align-top" key={row.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-[#625b55]">{formatDateTime(row.fecha, { timeZone })}</td>
                    <td className="py-3 pr-4 font-medium text-[#2d2926]">{row.profesional}</td>
                    <td className="py-3 pr-4 text-[#625b55]">
                      {row.servicio ?? "Servicio"}
                      <a className="ml-2 text-xs text-[#8a5140] hover:underline" href={buildAdminHref("/pos", { organizationId, sucursalId, extra: { ventaId: row.ventaId } })}>
                        ticket
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-[#625b55]">{fmt(row.base)}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">{fmt(row.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard description="Pagos de comisiones confirmados o revertidos." title="Historial de liquidaciones">
        {liquidaciones.length === 0 ? (
          <EmptyState description="Aún no se ha pagado ninguna liquidación." title="Sin liquidaciones" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Registro</th>
                  <th className="py-2 pr-4 font-medium">Profesional</th>
                  <th className="py-2 pr-4 font-medium">Periodo</th>
                  <th className="py-2 pr-4 font-medium">Medio</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  {puedeEditar ? <th className="py-2 font-medium">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map((liq) => (
                  <tr className="border-b border-[#f1eeea] align-top" key={liq.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-[#625b55]">{formatDateTime(liq.createdAt, { timeZone })}</td>
                    <td className="py-3 pr-4 font-medium text-[#2d2926]">{liq.profesional}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-[#625b55]">{liq.periodoDesde} → {liq.periodoHasta}</td>
                    <td className="py-3 pr-4 text-[#625b55]">{liq.medio}</td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">{fmt(liq.total)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={liq.estado === "confirmada" ? "success" : "neutral"}>
                        {ESTADO_LABEL[liq.estado] ?? liq.estado}
                      </StatusBadge>
                      {liq.motivoReversion ? (
                        <p className="mt-1 text-xs text-[#a8443a]">{liq.motivoReversion}</p>
                      ) : null}
                    </td>
                    {puedeEditar ? (
                      <td className="py-3">
                        {liq.estado === "confirmada" ? (
                          <RevertirLiquidacionForm liquidacionId={liq.id} organizationId={organizationId} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
