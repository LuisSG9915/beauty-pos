import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { LiquidarForm } from "@/app/admin/comisiones/liquidar-form";
import { RevertirLiquidacionForm } from "@/app/admin/comisiones/revertir-liquidacion-form";
import { AdminNavTabs, EQUIPO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime, todayDateInput } from "@/lib/format";
import { buildAdminHref, normalizeDateInput } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey } from "@/modules/agenda";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";
import type { ComisionPendienteRow, LiquidacionRow } from "@/modules/comisiones/queries";

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
  const puedeEditar = hasPermission(access, "comisiones.editar");

  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) notFound();

  const db = getDatabase();
  type PendienteJson = Omit<ComisionPendienteRow, "fecha"> & { fecha: string };
  type LiquidacionJson = Omit<LiquidacionRow, "createdAt"> & { createdAt: string };
  type ComisionesSqlRow = {
    medios: Array<{ id: string; nombre: string; categoria: string }>;
    pendientes: PendienteJson[];
    liquidaciones: LiquidacionJson[];
  };

  // Medios de pago, comisiones pendientes del rango e historial de
  // liquidaciones en UNA sola consulta SQL (antes 3 consultas paralelas). El
  // contexto de suscripción corre en la MISMA ronda (comparte la promesa en
  // vuelo de `AdminLayout` vía React.cache): 2 rondas y no 3.
  const [suscripcion, { rows: sqlRows }] = await Promise.all([
    contextoSuscripcion(organizationId),
    db.execute<ComisionesSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select mp.id, mp.nombre, mp.categoria
          from cat_medios_pago mp
          where mp.organizacion_id = ${organizationId} and mp.activo = true
          order by mp.nombre asc
        ) t
      ), '[]'::jsonb) as medios,
      coalesce((
        select jsonb_agg(t) from (
          select
            dvc.id,
            dvc.usuario_id as "usuarioId",
            u.nombre as profesional,
            s.nombre as servicio,
            dvc.venta_id as "ventaId",
            dvc.base::text as base,
            dvc.monto::text as monto,
            to_char(coalesce(v.cobrada_at, v.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fecha
          from detalle_ventas_comisiones dvc
          join ventas v on v.id = dvc.venta_id
          join usuarios u on u.id = dvc.usuario_id
          left join detalle_ventas_servicios dvs on dvs.id = dvc.detalle_venta_servicio_id
          left join servicios s on s.id = dvs.servicio_id
          where v.organizacion_id = ${organizationId}
            and v.sucursal_id = ${sucursalId}
            and v.activo = true
            and dvc.activo = true
            and dvc.liquidacion_id is null
            and coalesce(v.cobrada_at, v.created_at) >= ${boundsDesde.iniciaAt}
            and coalesce(v.cobrada_at, v.created_at) < ${boundsHasta.terminaAt}
          order by u.nombre asc, coalesce(v.cobrada_at, v.created_at) asc
        ) t
      ), '[]'::jsonb) as pendientes,
      coalesce((
        select jsonb_agg(t) from (
          select
            lc.id,
            u.nombre as profesional,
            lc.periodo_desde::text as "periodoDesde",
            lc.periodo_hasta::text as "periodoHasta",
            lc.total::text as total,
            mp.nombre as medio,
            lc.estado,
            lc.notas,
            lc.motivo_reversion as "motivoReversion",
            to_char(lc.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
          from liquidaciones_comisiones lc
          join usuarios u on u.id = lc.usuario_id
          join cat_medios_pago mp on mp.id = lc.medio_pago_id
          where lc.organizacion_id = ${organizationId}
            and lc.sucursal_id = ${sucursalId}
          order by lc.created_at desc
          limit 50
        ) t
      ), '[]'::jsonb) as liquidaciones
    `),
  ]);

  if (!suscripcion.capacidades.has("comisiones")) {
    return (
      <PlanUpgradeNotice
        capacidad="comisiones"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }

  const datos = sqlRows[0];
  const medios = datos?.medios ?? [];
  const pendientes: ComisionPendienteRow[] = (datos?.pendientes ?? []).map((p) => ({
    ...p,
    fecha: new Date(p.fecha),
  }));
  const liquidaciones: LiquidacionRow[] = (datos?.liquidaciones ?? []).map((l) => ({
    ...l,
    createdAt: new Date(l.createdAt),
  }));

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
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            sucursalId={sucursalId}
            tabs={EQUIPO_TABS}
          />
        }
        title="Comisiones"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" method="get">
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
        <Button className="rounded-xl" data-action-clave="1" data-action-id="comisiones.filtro.aplicar" size="lg" type="submit">Filtrar</Button>
      </form>

      <AdminCard description="Comisiones devengadas y activas aún sin pagar en el periodo." title="Pendientes por profesional">
        {resumen.length === 0 ? (
          <EmptyState description="No hay comisiones pendientes en este periodo." title="Sin pendientes" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumen.map((item, index) => (
              <div className="anim-entrada rounded-2xl border border-border bg-muted/60 p-4" key={item.usuarioId} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                <p className="font-medium text-foreground">{item.nombre}</p>
                <p className="mt-1 text-op-xs text-muted-foreground">{item.cantidad} línea(s) de servicio</p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{fmt(item.total)}</p>
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
              <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
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
                  <tr className="border-b border-border align-top" key={row.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDateTime(row.fecha, { timeZone })}</td>
                    <td className="py-3 pr-4 font-medium text-foreground">{row.profesional}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {row.servicio ?? "Servicio"}
                      <a
                        className="ml-2 inline-flex min-h-6 items-center text-op-xs text-primary hover:underline"
                        href={buildAdminHref("/pos", { organizationId, sucursalId, extra: { ventaId: row.ventaId } })}
                      >
                        ticket
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{fmt(row.base)}</td>
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
              <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
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
                  <tr className="border-b border-border align-top" key={liq.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDateTime(liq.createdAt, { timeZone })}</td>
                    <td className="py-3 pr-4 font-medium text-foreground">{liq.profesional}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{liq.periodoDesde} → {liq.periodoHasta}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{liq.medio}</td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">{fmt(liq.total)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={liq.estado === "confirmada" ? "success" : "neutral"}>
                        {ESTADO_LABEL[liq.estado] ?? liq.estado}
                      </StatusBadge>
                      {liq.motivoReversion ? (
                        <p className="mt-1 text-op-xs text-destructive">{liq.motivoReversion}</p>
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
