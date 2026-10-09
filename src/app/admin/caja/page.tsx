import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { AperturaCajaForm } from "@/app/admin/caja/apertura-caja-form";
import { CierreCajaForm } from "@/app/admin/caja/cierre-caja-form";
import { MovimientoCajaForm } from "@/app/admin/caja/movimiento-caja-form";
import { PoliticaCajaToggle } from "@/app/admin/caja/politica-caja-toggle";
import { AdminNavTabs, CAJA_VENTAS_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { sucursales, usuarios } from "@/db/schema/core";
import {
  cortesCaja,
  detalleCortes,
  detalleVentasComisiones,
  movimientosCaja,
  ventas,
} from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const num = (v: string | number | null | undefined) => Number(v ?? 0);

export default async function CajaPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAdminContext(await searchParams);
  const { organization, branch, timeZone, currency } = context;
  if (!organization || !branch) notFound();
  requireAccessPermission(context.access, "caja.ver");

  const db = getDatabase();

  // Independientes entre sí: una sola ronda en paralelo (~1 RT en vez de 4).
  const [[sucursalRow], [corteAbierto], medios, historial] = await Promise.all([
    db
      .select({ exigirCorteParaCobrar: sucursales.exigirCorteParaCobrar })
      .from(sucursales)
      .where(eq(sucursales.id, branch.id))
      .limit(1),
    db
      .select({ id: cortesCaja.id, fondoInicial: cortesCaja.fondoInicial, createdAt: cortesCaja.createdAt, notas: cortesCaja.notas })
      .from(cortesCaja)
      .where(and(eq(cortesCaja.sucursalId, branch.id), eq(cortesCaja.estado, "abierto"), eq(cortesCaja.activo, true)))
      .limit(1),
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, organization.id), eq(catMediosPago.activo, true)))
      .orderBy(catMediosPago.nombre),
    db
      .select({
        id: cortesCaja.id,
        fondoInicial: cortesCaja.fondoInicial,
        createdAt: cortesCaja.createdAt,
        cerradoAt: cortesCaja.cerradoAt,
        notas: cortesCaja.notas,
        abiertoPor: usuarios.nombre,
      })
      .from(cortesCaja)
      .leftJoin(usuarios, eq(cortesCaja.usuarioId, usuarios.id))
      .where(and(eq(cortesCaja.sucursalId, branch.id), eq(cortesCaja.estado, "cerrado"), eq(cortesCaja.activo, true)))
      .orderBy(desc(cortesCaja.cerradoAt))
      .limit(10),
  ]);

  const corteIds = historial.map((c) => c.id);
  const hayCorteIds = corteIds.length > 0;
  const emptyDetalles: {
    corteId: string;
    medioNombre: string;
    esperado: string;
    contado: string;
    diferencia: string;
  }[] = [];

  // Segunda ronda: ventas/movimientos del corte abierto y detalles del
  // historial van juntos en paralelo.
  // En corte abierto solo contamos ventas: mostrar importes rompería el cierre ciego.
  // Movimientos del turno: se listan (el cajero los registró) sin sumarlos al
  // esperado visible — el esperado solo se revela al confirmar el cierre.
  const [[ventasDelCorte], movimientosTurno, detalles, totalesVentas, totalesComisiones] = await Promise.all([
    corteAbierto
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(ventas)
          .where(and(eq(ventas.corteId, corteAbierto.id), eq(ventas.estado, "completada"), eq(ventas.activo, true)))
      : Promise.resolve([{ count: 0 }]),
    corteAbierto
      ? db
          .select({
            id: movimientosCaja.id,
            tipo: movimientosCaja.tipo,
            monto: movimientosCaja.monto,
            notas: movimientosCaja.notas,
            createdAt: movimientosCaja.createdAt,
            medioNombre: catMediosPago.nombre,
            usuarioNombre: usuarios.nombre,
          })
          .from(movimientosCaja)
          .innerJoin(catMediosPago, eq(movimientosCaja.medioPagoId, catMediosPago.id))
          .innerJoin(usuarios, eq(movimientosCaja.usuarioId, usuarios.id))
          .where(eq(movimientosCaja.corteId, corteAbierto.id))
          .orderBy(desc(movimientosCaja.createdAt))
      : Promise.resolve([]),
    hayCorteIds
      ? db
          .select({
            corteId: detalleCortes.corteId,
            medioNombre: catMediosPago.nombre,
            esperado: detalleCortes.esperado,
            contado: detalleCortes.contado,
            diferencia: detalleCortes.diferencia,
          })
          .from(detalleCortes)
          .innerJoin(catMediosPago, eq(detalleCortes.medioPagoId, catMediosPago.id))
          .where(inArray(detalleCortes.corteId, corteIds))
      : Promise.resolve(emptyDetalles),
    hayCorteIds
      ? db
          .select({
            corteId: ventas.corteId,
            ventasCount: sql<number>`count(*)::int`,
            total: sql<string>`coalesce(sum(${ventas.total}), 0)`,
            propinas: sql<string>`coalesce(sum(${ventas.propina}), 0)`,
          })
          .from(ventas)
          .where(and(inArray(ventas.corteId, corteIds), eq(ventas.estado, "completada"), eq(ventas.activo, true)))
          .groupBy(ventas.corteId)
      : Promise.resolve([]),
    hayCorteIds
      ? db
          .select({ corteId: ventas.corteId, total: sql<string>`coalesce(sum(${detalleVentasComisiones.monto}), 0)` })
          .from(detalleVentasComisiones)
          .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
          .where(and(inArray(ventas.corteId, corteIds), eq(detalleVentasComisiones.activo, true)))
          .groupBy(ventas.corteId)
      : Promise.resolve([]),
  ]);

  const detallesPorCorte = new Map<string, typeof detalles>();
  for (const d of detalles) {
    const list = detallesPorCorte.get(d.corteId) ?? [];
    list.push(d);
    detallesPorCorte.set(d.corteId, list);
  }
  const ventasPorCorte = new Map(totalesVentas.map((t) => [t.corteId, t]));
  const comisionesPorCorte = new Map(totalesComisiones.map((t) => [t.corteId, num(t.total)]));

  const fmt = (v: string | number | null | undefined) => formatCurrency(num(v), { currency });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · cierre ciego por turno`}
        tabs={
          <AdminNavTabs
            organizationId={organization.id}
            sucursalId={branch.id}
            tabs={CAJA_VENTAS_TABS}
          />
        }
        title="Caja"
      />

      {hasPermission(context.access, "caja.configurar") ? (
        <PoliticaCajaToggle
          exigir={sucursalRow?.exigirCorteParaCobrar ?? false}
          organizationId={organization.id}
          sucursalId={branch.id}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {corteAbierto ? (
          <div className="space-y-6 self-start">
            <AdminCard
              description={`Abierta ${formatDate(corteAbierto.createdAt, { timeZone })} ${formatTime(corteAbierto.createdAt, { timeZone })} · Fondo ${fmt(corteAbierto.fondoInicial)} · ${ventasDelCorte.count} venta(s) cobrada(s)`}
              title="Caja abierta — conteo del turno"
            >
              <CierreCajaForm corteId={corteAbierto.id} medios={medios} organizationId={organization.id} />
            </AdminCard>

            <AdminCard
              description="Entradas, retiros, gastos, depósitos y ajustes del turno (solo efectivo)."
              title="Movimientos de caja"
            >
              <MovimientoCajaForm
                mediosEfectivo={medios.filter((m) => m.categoria === "efectivo")}
                organizationId={organization.id}
                sucursalId={branch.id}
              />
              {movimientosTurno.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {movimientosTurno.map((mov) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-sm"
                      key={mov.id}
                    >
                      <div className="min-w-0">
                        <p className="font-medium capitalize text-foreground">{mov.tipo}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(mov.createdAt, { timeZone })} · {mov.medioNombre} · {mov.usuarioNombre}
                          {mov.notas ? ` · ${mov.notas}` : ""}
                        </p>
                      </div>
                      <span
                        className={`tabular-nums font-semibold ${
                          mov.tipo === "entrada" || (mov.tipo === "ajuste" && num(mov.monto) > 0)
                            ? "text-success"
                            : "text-destructive"
                        }`}
                      >
                        {mov.tipo === "entrada" || mov.tipo === "ajuste"
                          ? (num(mov.monto) > 0 ? "+" : "") + fmt(mov.monto)
                          : `-${fmt(mov.monto)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </AdminCard>
          </div>
        ) : (
          <AdminCard className="self-start" description="Registra el fondo inicial para empezar a asociar ventas." title="Abrir caja">
            <AperturaCajaForm organizationId={organization.id} sucursalId={branch.id} />
          </AdminCard>
        )}

        <AdminCard className="self-start" description="Diferencias esperado vs. contado por medio de pago." title="Cortes recientes">
          {historial.length === 0 ? (
            <EmptyState description="Aquí aparecerán los cortes cerrados con su reporte de discrepancias." title="Sin cortes aún" />
          ) : (
            <ul className="space-y-4">
              {historial.map((corte) => {
                const tot = ventasPorCorte.get(corte.id);
                const diferenciaTotal = (detallesPorCorte.get(corte.id) ?? []).reduce((s, d) => s + num(d.diferencia), 0);
                return (
                  <li className="rounded-xl border border-border p-4" key={corte.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {formatDate(corte.createdAt, { timeZone })} · {formatTime(corte.createdAt, { timeZone })} →{" "}
                        {corte.cerradoAt ? formatTime(corte.cerradoAt, { timeZone }) : "—"}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          Math.abs(diferenciaTotal) < 0.005 ? "bg-success-soft text-success-soft-foreground" : "bg-destructive-soft text-destructive-soft-foreground"
                        }`}
                      >
                        {Math.abs(diferenciaTotal) < 0.005 ? "Cuadrado" : `Diferencia ${fmt(diferenciaTotal)}`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {corte.abiertoPor ?? "—"} · {tot?.ventasCount ?? 0} venta(s) · {fmt(tot?.total)} ventas ·{" "}
                      {fmt(tot?.propinas)} propinas · {fmt(comisionesPorCorte.get(corte.id))} comisiones
                    </p>
                    <table className="mt-3 w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Medio</th>
                          <th className="py-1 pr-3 text-right font-medium">Esperado</th>
                          <th className="py-1 pr-3 text-right font-medium">Contado</th>
                          <th className="py-1 text-right font-medium">Dif.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detallesPorCorte.get(corte.id) ?? []).map((d, i) => (
                          <tr className="border-t border-border" key={i}>
                            <td className="py-1.5 pr-3">{d.medioNombre}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(d.esperado)}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(d.contado)}</td>
                            <td
                              className={`py-1.5 text-right font-medium tabular-nums ${
                                Math.abs(num(d.diferencia)) < 0.005 ? "text-success" : "text-destructive"
                              }`}
                            >
                              {fmt(d.diferencia)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {corte.notas ? <p className="mt-2 text-xs text-muted-foreground">Notas: {corte.notas}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
