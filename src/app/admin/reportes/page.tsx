import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { BarChart, HBarChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { clientes, usuarios } from "@/db/schema/core";
import {
  ajustesPagosVenta,
  citas,
  cortesCaja,
  detalleCortes,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasPropinas,
  detalleVentasServicios,
  liquidacionesComisiones,
  ventas,
} from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime, todayDateInput } from "@/lib/format";
import { normalizeDateInput } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey } from "@/modules/agenda";
import { resumenGastos } from "@/modules/gastos/queries";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<AdminSearchParams> };

const num = (v: string | number | null | undefined) => Number(v ?? 0);

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

function Tabla({
  encabezados,
  filas,
  vacio,
}: {
  encabezados: string[];
  filas: React.ReactNode[][];
  vacio: string;
}) {
  if (filas.length === 0) {
    return <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="border-b border-[#eee8e3] text-left">
            {encabezados.map((h) => (
              <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[#81746c] last:pr-0" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eee8e3]">
          {filas.map((celdas, i) => (
            <tr key={i}>
              {celdas.map((celda, j) => (
                <td className="py-2.5 pr-4 align-top text-[#403a35] last:pr-0" key={j}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#eee8e3] bg-[#faf9f7] px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[#81746c]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[#2d2926]">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[#81746c]">{hint}</p> : null}
    </div>
  );
}

/** Reportes operativos y financieros de la sucursal activa, acotados por rango. */
export default async function ReportesPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, timeZone, currency } = context;
  if (!organization || !branch) notFound();

  const puedeOperativos = hasPermission(context.access, "reportes.operativos");
  const puedeFinancieros = hasPermission(context.access, "reportes.financieros");
  if (!puedeOperativos && !puedeFinancieros) notFound();

  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) notFound();
  const iniciaAt = boundsDesde.iniciaAt;
  const terminaAt = boundsHasta.terminaAt;

  const db = getDatabase();
  const fmt = (v: string | number | null | undefined) => formatCurrency(num(v), { currency });
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const scopeVenta = () =>
    and(
      eq(ventas.organizacionId, organization.id),
      eq(ventas.sucursalId, branch.id),
      eq(ventas.estado, "completada"),
      eq(ventas.activo, true),
      gte(fechaVenta, iniciaAt),
      lt(fechaVenta, terminaAt),
    );
  const scopeCita = () =>
    and(
      eq(citas.organizacionId, organization.id),
      eq(citas.sucursalId, branch.id),
      eq(citas.activo, true),
      gte(citas.fechaHora, iniciaAt),
      lt(citas.fechaHora, terminaAt),
    );
  const [
    citasPorEstado,
    clientesNuevos,
    topServicios,
    profesionales,
    ventasPorDia,
    pagosPorMedio,
    descuentos,
    comisionPorUsuario,
    propinaPorUsuario,
    diferenciasCorte,
    gastosResumen,
    liquidadoPorUsuario,
  ] = await Promise.all([
    puedeOperativos
      ? db
          .select({ estado: citas.estado, total: sql<number>`count(*)::int` })
          .from(citas)
          .where(scopeCita())
          .groupBy(citas.estado)
      : Promise.resolve([]),
    puedeOperativos
      ? db
          .select({ total: sql<number>`count(*)::int` })
          .from(clientes)
          .where(
            and(
              eq(clientes.organizacionId, organization.id),
              eq(clientes.activo, true),
              gte(clientes.createdAt, iniciaAt),
              lt(clientes.createdAt, terminaAt),
            ),
          )
      : Promise.resolve([{ total: 0 }]),
    puedeOperativos
      ? db
          .select({
            nombre: detalleVentasServicios.nombre,
            unidades: sql<number>`coalesce(sum(${detalleVentasServicios.cantidad}), 0)::int`,
            importe: sql<string>`coalesce(sum(${detalleVentasServicios.precio} * ${detalleVentasServicios.cantidad}), 0)`,
          })
          .from(detalleVentasServicios)
          .innerJoin(ventas, eq(detalleVentasServicios.ventaId, ventas.id))
          .where(and(scopeVenta(), eq(detalleVentasServicios.activo, true)))
          .groupBy(detalleVentasServicios.nombre)
          .orderBy(desc(sql`sum(${detalleVentasServicios.precio} * ${detalleVentasServicios.cantidad})`))
          .limit(10)
      : Promise.resolve([]),
    puedeOperativos
      ? db
          .select({
            nombre: usuarios.nombre,
            total: sql<number>`count(*)::int`,
            completadas: sql<number>`count(*) filter (where ${citas.estado} = 'completada')::int`,
            minutos: sql<number>`coalesce(sum(${citas.duracionMinutos}), 0)::int`,
          })
          .from(citas)
          .innerJoin(usuarios, eq(citas.usuarioId, usuarios.id))
          .where(scopeCita())
          .groupBy(usuarios.nombre)
          .orderBy(desc(sql`count(*)`))
      : Promise.resolve([]),
    puedeFinancieros
      ? db
          .select({
            dia: sql<string>`(${fechaVenta} at time zone ${timeZone})::date::text`,
            operaciones: sql<number>`count(*)::int`,
            descuentos: sql<string>`coalesce(sum(${ventas.descuento} + ${ventas.descuentoPromocion} + ${ventas.descuentoMembresia}), 0)`,
            propinas: sql<string>`coalesce(sum(${ventas.propina}), 0)`,
            total: sql<string>`coalesce(sum(${ventas.total}), 0)`,
          })
          .from(ventas)
          .where(scopeVenta())
          // GROUP BY 1 = primera columna del SELECT: con parámetros, Postgres
          // no equipara ($1) y ($8) aunque la expresión sea idéntica.
          .groupBy(sql`1`)
          .orderBy(sql`1 desc`)
      : Promise.resolve([]),
    puedeFinancieros
      ? Promise.all([
          db
            .select({
              medioPagoId: detalleVentasMediosPagos.medioPagoId,
              nombre: catMediosPago.nombre,
              operaciones: sql<number>`count(*)::int`,
              total: sql<string>`coalesce(sum(${detalleVentasMediosPagos.monto}), 0)`,
            })
            .from(detalleVentasMediosPagos)
            .innerJoin(ventas, eq(detalleVentasMediosPagos.ventaId, ventas.id))
            .innerJoin(catMediosPago, eq(detalleVentasMediosPagos.medioPagoId, catMediosPago.id))
            .where(and(scopeVenta(), eq(detalleVentasMediosPagos.activo, true)))
            .groupBy(detalleVentasMediosPagos.medioPagoId, catMediosPago.nombre)
            .orderBy(desc(sql`sum(${detalleVentasMediosPagos.monto})`)),
          db
            .select({
              origenId: ajustesPagosVenta.medioPagoOrigenId,
              destinoId: ajustesPagosVenta.medioPagoDestinoId,
              total: sql<string>`coalesce(sum(${ajustesPagosVenta.monto}), 0)`,
            })
            .from(ajustesPagosVenta)
            .innerJoin(detalleVentasMediosPagos, eq(ajustesPagosVenta.detalleVentaMedioPagoId, detalleVentasMediosPagos.id))
            .innerJoin(ventas, eq(ajustesPagosVenta.ventaId, ventas.id))
            .where(and(scopeVenta(), eq(detalleVentasMediosPagos.activo, true)))
            .groupBy(ajustesPagosVenta.medioPagoOrigenId, ajustesPagosVenta.medioPagoDestinoId),
          db
            .select({ id: catMediosPago.id, nombre: catMediosPago.nombre })
            .from(catMediosPago)
            .where(eq(catMediosPago.organizacionId, organization.id)),
        ]).then(([originales, ajustes, medios]) => {
          const nombres = new Map(medios.map((medio) => [medio.id, medio.nombre]));
          const porMedio = new Map<string, { nombre: string; operaciones: number; total: number }>();
          for (const row of originales) {
            porMedio.set(row.medioPagoId, { nombre: row.nombre, operaciones: row.operaciones, total: num(row.total) });
          }
          for (const ajuste of ajustes) {
            const origen = porMedio.get(ajuste.origenId);
            if (origen) origen.total -= num(ajuste.total);
            const destino = porMedio.get(ajuste.destinoId) ?? {
              nombre: nombres.get(ajuste.destinoId) ?? "Medio inactivo",
              operaciones: 0,
              total: 0,
            };
            destino.operaciones += 1;
            destino.total += num(ajuste.total);
            porMedio.set(ajuste.destinoId, destino);
          }
          return [...porMedio.values()]
            .filter((row) => row.total > 0.005)
            .sort((a, b) => b.total - a.total);
        })
      : Promise.resolve([]),
    puedeFinancieros
      ? db
          .select({
            manual: sql<string>`coalesce(sum(${ventas.descuento}), 0)`,
            promocion: sql<string>`coalesce(sum(${ventas.descuentoPromocion}), 0)`,
            membresia: sql<string>`coalesce(sum(${ventas.descuentoMembresia}), 0)`,
          })
          .from(ventas)
          .where(scopeVenta())
      : Promise.resolve([]),
    puedeFinancieros
      ? db
          .select({
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${detalleVentasComisiones.monto}), 0)`,
          })
          .from(detalleVentasComisiones)
          .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
          .innerJoin(usuarios, eq(detalleVentasComisiones.usuarioId, usuarios.id))
          .where(and(scopeVenta(), eq(detalleVentasComisiones.activo, true)))
          .groupBy(usuarios.nombre)
          .orderBy(desc(sql`sum(${detalleVentasComisiones.monto})`))
      : Promise.resolve([]),
    puedeFinancieros
      ? db
          .select({
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${detalleVentasPropinas.monto}), 0)`,
          })
          .from(detalleVentasPropinas)
          .innerJoin(ventas, eq(detalleVentasPropinas.ventaId, ventas.id))
          .innerJoin(usuarios, eq(detalleVentasPropinas.usuarioId, usuarios.id))
          .where(and(scopeVenta(), eq(detalleVentasPropinas.activo, true)))
          .groupBy(usuarios.nombre)
          .orderBy(desc(sql`sum(${detalleVentasPropinas.monto})`))
      : Promise.resolve([]),
    puedeFinancieros
      ? db
          .select({
            cerradoAt: cortesCaja.cerradoAt,
            cajero: usuarios.nombre,
            medio: catMediosPago.nombre,
            esperado: detalleCortes.esperado,
            contado: detalleCortes.contado,
            diferencia: detalleCortes.diferencia,
          })
          .from(detalleCortes)
          .innerJoin(cortesCaja, eq(detalleCortes.corteId, cortesCaja.id))
          .innerJoin(catMediosPago, eq(detalleCortes.medioPagoId, catMediosPago.id))
          .leftJoin(usuarios, eq(cortesCaja.usuarioId, usuarios.id))
          .where(
            and(
              eq(cortesCaja.organizacionId, organization.id),
              eq(cortesCaja.sucursalId, branch.id),
              eq(cortesCaja.estado, "cerrado"),
              eq(detalleCortes.activo, true),
              sql`${detalleCortes.diferencia} <> 0`,
              gte(cortesCaja.cerradoAt, iniciaAt),
              lt(cortesCaja.cerradoAt, terminaAt),
            ),
          )
          .orderBy(desc(cortesCaja.cerradoAt))
          .limit(20)
      : Promise.resolve([]),
    puedeFinancieros
      ? resumenGastos(db, { organizacionId: organization.id, sucursalId: branch.id, desde, hasta })
      : Promise.resolve({ totalConfirmado: 0, totalRevertido: 0, porCategoria: [] }),
    // Pagado en el periodo = liquidaciones confirmadas por su fecha de
    // registro (el pago puede cubrir comisiones devengadas antes del rango).
    puedeFinancieros
      ? db
          .select({
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${liquidacionesComisiones.total}), 0)`,
          })
          .from(liquidacionesComisiones)
          .innerJoin(usuarios, eq(liquidacionesComisiones.usuarioId, usuarios.id))
          .where(
            and(
              eq(liquidacionesComisiones.organizacionId, organization.id),
              eq(liquidacionesComisiones.sucursalId, branch.id),
              eq(liquidacionesComisiones.estado, "confirmada"),
              gte(liquidacionesComisiones.createdAt, iniciaAt),
              lt(liquidacionesComisiones.createdAt, terminaAt),
            ),
          )
          .groupBy(usuarios.nombre)
          .orderBy(desc(sql`sum(${liquidacionesComisiones.total})`))
      : Promise.resolve([]),
  ]);

  // KPIs operativos
  const totalCitas = citasPorEstado.reduce((acc, row) => acc + row.total, 0);
  const completadas = citasPorEstado.find((row) => row.estado === "completada")?.total ?? 0;
  const finalizadas = citasPorEstado
    .filter((row) => ["completada", "cancelada", "no_asistio"].includes(row.estado))
    .reduce((acc, row) => acc + row.total, 0);
  const asistencia = finalizadas > 0 ? Math.round((completadas / finalizadas) * 100) : null;

  // KPIs financieros
  const vendido = ventasPorDia.reduce((acc, row) => acc + num(row.total), 0);
  const propinasTotal = ventasPorDia.reduce((acc, row) => acc + num(row.propinas), 0);
  const operaciones = ventasPorDia.reduce((acc, row) => acc + row.operaciones, 0);
  const descuentosRow = descuentos[0];
  const descuentosTotal = descuentosRow ? num(descuentosRow.manual) + num(descuentosRow.promocion) + num(descuentosRow.membresia) : 0;
  // Resultado estimado: ventas cobradas menos gastos confirmados. No es la
  // utilidad real — faltan comisiones pagadas y costos de insumos.
  const resultadoEstimado = vendido - gastosResumen.totalConfirmado;

  // Comisiones devengadas/pagadas + propinas por profesional (mapa unificado)
  const profesionalFinanciero = new Map<string, { comisiones: number; liquidadas: number; propinas: number }>();
  for (const row of comisionPorUsuario) {
    const actual = profesionalFinanciero.get(row.nombre) ?? { comisiones: 0, liquidadas: 0, propinas: 0 };
    actual.comisiones = num(row.total);
    profesionalFinanciero.set(row.nombre, actual);
  }
  for (const row of liquidadoPorUsuario) {
    const actual = profesionalFinanciero.get(row.nombre) ?? { comisiones: 0, liquidadas: 0, propinas: 0 };
    actual.liquidadas = num(row.total);
    profesionalFinanciero.set(row.nombre, actual);
  }
  for (const row of propinaPorUsuario) {
    const actual = profesionalFinanciero.get(row.nombre) ?? { comisiones: 0, liquidadas: 0, propinas: 0 };
    actual.propinas = num(row.total);
    profesionalFinanciero.set(row.nombre, actual);
  }
  const profesionalRows = [...profesionalFinanciero.entries()].sort(
    (a, b) => b[1].comisiones + b[1].propinas - (a[1].comisiones + a[1].propinas),
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader description={`${branch.nombre} · ${desde} → ${hasta}`} title="Reportes" />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organization.id} />
        <input name="sucursalId" type="hidden" value={branch.id} />
        <Field className="w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Button className="rounded-xl" type="submit">Aplicar</Button>
      </form>

      {puedeOperativos ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Citas en el rango" value={String(totalCitas)} />
            <Kpi label="Asistencia" value={asistencia == null ? "—" : `${asistencia}%`} hint="completadas / finalizadas" />
            <Kpi label="Clientes nuevos" value={String(clientesNuevos[0]?.total ?? 0)} />
            <Kpi label="Profesionales con agenda" value={String(profesionales.length)} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminCard description="Citas activas por estado en el período" title="Citas por estado">
              <Tabla
                encabezados={["Estado", "Citas"]}
                filas={citasPorEstado
                  .sort((a, b) => b.total - a.total)
                  .map((row) => [ESTADO_LABEL[row.estado] ?? row.estado, String(row.total)])}
                vacio="Sin citas en el rango."
              />
            </AdminCard>
            <AdminCard description="Por importe vendido en ventas cobradas" title="Servicios más vendidos">
              <Tabla
                encabezados={["Servicio", "Unidades", "Importe"]}
                filas={topServicios.map((row) => [row.nombre ?? "Servicio", String(row.unidades), fmt(row.importe)])}
                vacio="Sin servicios vendidos en el rango."
              />
            </AdminCard>
          </div>

          <AdminCard description="Citas agendadas por profesional" title="Productividad del equipo">
            <Tabla
              encabezados={["Profesional", "Citas", "Completadas", "Minutos agendados"]}
              filas={profesionales.map((row) => [
                row.nombre,
                String(row.total),
                String(row.completadas),
                String(row.minutos),
              ])}
              vacio="Sin citas asignadas en el rango."
            />
          </AdminCard>
        </>
      ) : null}

      {puedeFinancieros ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi label="Vendido" value={fmt(vendido)} />
            <Kpi label="Ticket promedio" value={operaciones > 0 ? fmt(vendido / operaciones) : "—"} hint={`${operaciones} venta(s)`} />
            <Kpi label="Propinas" value={fmt(propinasTotal)} />
            <Kpi
              label="Descuentos"
              value={fmt(descuentosTotal)}
              hint={`manual ${fmt(descuentosRow?.manual)} · promo ${fmt(descuentosRow?.promocion)} · membresía ${fmt(descuentosRow?.membresia)}`}
            />
            <Kpi
              label="Gastos"
              value={fmt(gastosResumen.totalConfirmado)}
              hint={gastosResumen.totalRevertido > 0 ? `${fmt(gastosResumen.totalRevertido)} revertidos en el periodo` : undefined}
            />
            <Kpi
              label="Resultado estimado"
              value={fmt(resultadoEstimado)}
              hint="vendido − gastos; antes de comisiones pagadas y costos"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminCard description="Ventas cobradas por día" title="Ventas por día">
              <div className="mb-4">
                <BarChart
                  formato={(v) => fmt(v)}
                  puntos={ventasPorDia.map((row) => ({
                    etiqueta: row.dia.slice(5),
                    valor: num(row.total),
                    detalle: `${row.operaciones} venta(s)`,
                  }))}
                />
              </div>
              <Tabla
                encabezados={["Día", "Ventas", "Descuentos", "Propinas", "Total"]}
                filas={ventasPorDia.map((row) => [
                  // `dia` ya es la fecha local de la sucursal (YYYY-MM-DD).
                  row.dia,
                  String(row.operaciones),
                  fmt(row.descuentos),
                  fmt(row.propinas),
                  <span className="font-semibold" key="t">{fmt(row.total)}</span>,
                ])}
                vacio="Sin ventas cobradas en el rango."
              />
            </AdminCard>
            <AdminCard description="Monto cobrado por medio de pago" title="Cobros por medio de pago">
              <div className="mb-4">
                <HBarChart
                  formato={(v) => fmt(v)}
                  puntos={pagosPorMedio.map((row) => ({
                    etiqueta: row.nombre,
                    valor: num(row.total),
                    detalle: `${row.operaciones} operación(es)`,
                  }))}
                />
              </div>
              <Tabla
                encabezados={["Medio", "Operaciones", "Total"]}
                filas={pagosPorMedio.map((row) => [row.nombre, String(row.operaciones), fmt(row.total)])}
                vacio="Sin cobros en el rango."
              />
            </AdminCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminCard description="Devengado en ventas cobradas vs. pagado (liquidaciones del periodo)" title="Comisiones y propinas por profesional">
              <Tabla
                encabezados={["Profesional", "Devengado", "Pagado", "Propinas"]}
                filas={profesionalRows.map(([nombre, valores]) => [
                  nombre,
                  fmt(valores.comisiones),
                  fmt(valores.liquidadas),
                  fmt(valores.propinas),
                ])}
                vacio="Sin comisiones ni propinas en el rango."
              />
            </AdminCard>
            <AdminCard description="Gastos confirmados del periodo por categoría" title="Gastos por categoría">
              <div className="mb-4">
                <HBarChart
                  color="#a76348"
                  formato={(v) => fmt(v)}
                  puntos={gastosResumen.porCategoria.map((row) => ({
                    etiqueta: row.nombre,
                    valor: num(row.total),
                  }))}
                />
              </div>
              <Tabla
                encabezados={["Categoría", "Total"]}
                filas={gastosResumen.porCategoria.map((row) => [row.nombre, fmt(row.total)])}
                vacio="Sin gastos confirmados en el rango."
              />
            </AdminCard>
            <AdminCard description="Cierres cuyo conteo no cuadró con el esperado" title="Diferencias de corte">
              <Tabla
                encabezados={["Cierre", "Cajero", "Medio", "Esperado", "Contado", "Diferencia"]}
                filas={diferenciasCorte.map((row) => [
                  row.cerradoAt ? `${formatDate(row.cerradoAt, { timeZone })} ${formatTime(row.cerradoAt, { timeZone })}` : "—",
                  row.cajero ?? "—",
                  row.medio,
                  fmt(row.esperado),
                  fmt(row.contado),
                  <span className="font-semibold text-[#a8443a]" key="d">{fmt(row.diferencia)}</span>,
                ])}
                vacio="Todos los cierres cuadraron en el rango."
              />
            </AdminCard>
          </div>
        </>
      ) : null}

      <details className="rounded-2xl border border-[#eadfd8] bg-white px-5 py-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-semibold text-[#403a35] select-none">
          ¿Cómo se calculan estas cifras?
        </summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            ["Vendido", "Suma del total de ventas cobradas en el rango, por fecha de cobro. Las ventas canceladas no suman."],
            ["Ticket promedio", "Vendido ÷ número de ventas cobradas del rango."],
            ["Asistencia", "Citas completadas ÷ citas finalizadas (completadas + no asistió + canceladas tardías)."],
            ["Devengado", "Comisión generada por las ventas cobradas del rango, aunque aún no se pague."],
            ["Pagado", "Comisiones cuya liquidación se confirmó dentro del rango, aunque la venta sea de otra fecha."],
            ["Resultado estimado", "Vendido − gastos confirmados. No es utilidad contable: falta costo de productos e impuestos."],
            ["Diferencias de corte", "Cierres donde el efectivo contado no coincidió con el esperado del sistema."],
            ["Cobros por medio", "Pagos del rango por medio de pago, incluyendo correcciones de medio posteriores al cobro."],
          ].map(([termino, definicion]) => (
            <div key={termino}>
              <dt className="font-medium text-[#403a35]">{termino}</dt>
              <dd className="mt-0.5 text-xs leading-5 text-[#81746c]">{definicion}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
