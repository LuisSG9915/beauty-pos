import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { BarChart, HBarChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime, todayDateInput } from "@/lib/format";
import { firstParam, normalizeDateInput } from "@/lib/url-context";
import { resolveTimeZone, shiftDateKey } from "@/modules/agenda";
import { contextoSuscripcionCache, tieneCapacidad } from "@/modules/billing/queries";
import {
  cargarAgregadosAnteriores,
  cargarReporte,
  comparativoSucursales,
  num,
} from "@/modules/reportes/queries";
import {
  deltaKpi,
  derivarAvisos,
  derivarCitas,
  derivarReservasWeb,
  derivarVentas,
  etiquetaDelta,
  periodoAnterior,
  presetsPeriodo,
} from "@/modules/reportes/rules";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<AdminSearchParams> };

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ORIGEN_LABEL: Record<string, string> = {
  panel: "Agenda interna",
  web: "Reserva en línea",
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
  const puedeExportar = hasPermission(context.access, "reportes.exportar");
  if (!puedeOperativos && !puedeFinancieros) notFound();

  const db = getDatabase();
  // Vista consolidada (Profesional): `sucursalId=todas` suma todas las
  // sucursales del alcance del usuario. La zona del reporte es explícita —
  // la de la organización — para no mezclar días de zonas distintas.
  const suscripcionCtx = await contextoSuscripcionCache(organization.id);
  const multisucursal = tieneCapacidad(suscripcionCtx, "multisucursal");
  const consolidado =
    firstParam(params.sucursalId) === "todas" && multisucursal && context.branches.length > 1;
  const reportTimeZone = consolidado ? resolveTimeZone(null, organization.zonaHoraria) : timeZone;
  const sucursalReporte = consolidado ? null : branch.id;
  const sucursalNombre = consolidado ? "Todas las sucursales" : branch.nombre;
  const permitidas = context.access.branchIds;

  const hoy = todayDateInput(reportTimeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const anterior = periodoAnterior(desde, hasta);

  const fmt = (v: string | number | null | undefined) => formatCurrency(num(v), { currency });
  const [reporte, agregadosAnteriores, comparativo] = await Promise.all([
    cargarReporte(db, {
      organizacionId: organization.id,
      sucursalId: sucursalReporte,
      timeZone: reportTimeZone,
      desde,
      hasta,
      operativos: puedeOperativos,
      financieros: puedeFinancieros,
      sucursalesPermitidas: permitidas,
    }),
    anterior
      ? cargarAgregadosAnteriores(db, {
          organizacionId: organization.id,
          sucursalId: sucursalReporte,
          timeZone: reportTimeZone,
          desde: anterior.desde,
          hasta: anterior.hasta,
          operativos: puedeOperativos,
          financieros: puedeFinancieros,
          sucursalesPermitidas: permitidas,
        })
      : Promise.resolve({ ventasAnt: [{ total: "0", operaciones: 0 }], citasAnt: [] }),
    // Comparativo por sucursal: solo en vista consolidada.
    consolidado
      ? comparativoSucursales(db, {
          organizacionId: organization.id,
          sucursalesPermitidas: permitidas,
          timeZone: reportTimeZone,
          desde,
          hasta,
          operativos: puedeOperativos,
          financieros: puedeFinancieros,
        })
      : Promise.resolve([]),
  ]);
  if (!reporte) notFound();
  const {
    citasPorEstado,
    clientesNuevos,
    topServicios,
    profesionales,
    citasPorOrigen,
    avisosMetricas,
    ventasPorDia,
    pagosPorMedio,
    descuentos,
    comisionPorUsuario,
    propinaPorUsuario,
    diferenciasCorte,
    gastosResumen,
    liquidadoPorUsuario,
    devolucionesResumen,
    anticiposResumen,
    productosSinCosto,
  } = reporte;
  const { ventasAnt, citasAnt } = agregadosAnteriores;

  // KPIs operativos
  const { totalCitas, asistencia } = derivarCitas(citasPorEstado);

  // KPIs financieros
  const { vendido, propinasTotal, operaciones } = derivarVentas(ventasPorDia);
  const descuentosRow = descuentos[0];
  const descuentosTotal = descuentosRow ? num(descuentosRow.manual) + num(descuentosRow.promocion) + num(descuentosRow.membresia) : 0;
  // Resultado estimado: ventas cobradas menos gastos confirmados. No es la
  // utilidad real — faltan comisiones pagadas y costos de insumos.
  const resultadoEstimado = vendido - gastosResumen.totalConfirmado;

  // Comisiones devengadas/pagadas + propinas por profesional (mapa por ID —
  // dos personas pueden compartir nombre y jamás deben consolidarse).
  const profesionalFinanciero = new Map<string, { nombre: string; comisiones: number; liquidadas: number; propinas: number }>();
  const mergeProfesional = (usuarioId: string, nombre: string, key: "comisiones" | "liquidadas" | "propinas", total: string) => {
    const actual = profesionalFinanciero.get(usuarioId) ?? { nombre, comisiones: 0, liquidadas: 0, propinas: 0 };
    actual[key] = num(total);
    profesionalFinanciero.set(usuarioId, actual);
  };
  for (const row of comisionPorUsuario) mergeProfesional(row.usuarioId, row.nombre, "comisiones", row.total);
  for (const row of liquidadoPorUsuario) mergeProfesional(row.usuarioId, row.nombre, "liquidadas", row.total);
  for (const row of propinaPorUsuario) mergeProfesional(row.usuarioId, row.nombre, "propinas", row.total);
  const profesionalRows = [...profesionalFinanciero.values()].sort(
    (a, b) => b.comisiones + b.propinas - (a.comisiones + a.propinas),
  );

  // Comparación con el periodo anterior (mismo largo, inmediatamente previo).
  const vendidoAnt = num(ventasAnt[0]?.total);
  const operacionesAnt = num(ventasAnt[0]?.operaciones);
  const { totalCitas: totalCitasAnt, asistencia: asistenciaAntRaw } = derivarCitas(citasAnt);
  const asistenciaAnt = asistenciaAntRaw == null ? null : asistenciaAntRaw;

  // Métricas de reservas públicas y avisos.
  const reservasWeb = derivarReservasWeb(citasPorOrigen);
  const { avisosEnviados, avisosFallidos, avisosOmitidos, avisosPendientes, avisosReintentos } =
    derivarAvisos(avisosMetricas);

  const devolucionesTotal = num(devolucionesResumen[0]?.total);
  const devolucionesOps = devolucionesResumen[0]?.operaciones ?? 0;
  const anticiposRow = anticiposResumen[0];

  const sucursalParam = consolidado ? "todas" : branch.id;
  const filtrosExport = new URLSearchParams({
    organizationId: organization.id,
    sucursalId: sucursalParam,
    desde,
    hasta,
  }).toString();
  const presets = presetsPeriodo(hoy);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${sucursalNombre} · ${desde} → ${hasta}${consolidado ? ` · zona del reporte: ${reportTimeZone}` : ""}`}
        title="Reportes"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organization.id} />
        {context.branches.length > 1 ? (
          <Field className="w-56">
            <FieldLabel>Sucursal</FieldLabel>
            <Select defaultValue={sucursalParam} name="sucursalId">
              {context.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} · {b.clave}
                </option>
              ))}
              {multisucursal ? <option value="todas">Todas las sucursales</option> : null}
            </Select>
          </Field>
        ) : (
          <input name="sucursalId" type="hidden" value={branch.id} />
        )}
        <Field className="w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Button className="rounded-xl" type="submit">Aplicar</Button>
        {puedeExportar ? (
          <a
            className="inline-flex h-10 items-center rounded-xl border border-[#d9cdc4] px-4 text-sm font-medium text-[#5f5347] transition hover:bg-[#f6efe9]"
            href={`/admin/reportes/export?${filtrosExport}`}
          >
            Exportar CSV
          </a>
        ) : null}
        <div className="flex w-full flex-wrap items-center gap-2 pt-1 text-xs text-[#81746c]">
          <span className="font-medium text-[#6f665e]">Rangos rápidos:</span>
          {presets.map((preset) => {
            const href = `?${new URLSearchParams({
              organizationId: organization.id,
              sucursalId: sucursalParam,
              desde: preset.desde,
              hasta: preset.hasta,
            }).toString()}`;
            const activo = preset.desde === desde && preset.hasta === hasta;
            return (
              <Link
                className={`rounded-full border px-3 py-1.5 font-medium transition ${
                  activo
                    ? "border-[#b5563f] bg-[#f7e8e2] text-[#8f3f2c]"
                    : "border-[#e4d8cf] text-[#6f665e] hover:bg-[#f6efe9]"
                }`}
                href={href}
                key={preset.clave}
              >
                {preset.etiqueta}
              </Link>
            );
          })}
          {anterior ? (
            <span className="ml-auto text-[#9c9188]">
              Comparando contra {anterior.desde} → {anterior.hasta}
            </span>
          ) : null}
        </div>
      </form>

      {consolidado ? (
        <AdminCard
          description={`Ventas cobradas y citas por sucursal, en la zona del reporte (${reportTimeZone}). El consolidado es la suma de estas filas.`}
          title="Comparativo por sucursal"
        >
          <Tabla
            encabezados={["Sucursal", "Vendido", "Ventas", "Citas", "Completadas", "Canceladas", "No asistió"]}
            filas={comparativo.map((row) => [
              row.nombre,
              fmt(row.vendido),
              String(row.operaciones),
              String(row.citas),
              String(row.completadas),
              String(row.canceladas),
              String(row.noShow),
            ])}
            vacio="Sin operaciones en el rango."
          />
        </AdminCard>
      ) : null}

      {puedeOperativos ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              hint={etiquetaDelta(deltaKpi(totalCitas, totalCitasAnt))}
              label="Citas en el rango"
              value={String(totalCitas)}
            />
            <Kpi
              hint={asistencia == null || asistenciaAnt == null ? "completadas / finalizadas" : `${etiquetaDelta(deltaKpi(asistencia, asistenciaAnt))} · completadas / finalizadas`}
              label="Asistencia"
              value={asistencia == null ? "—" : `${asistencia}%`}
            />
            <Kpi
              hint="primera atención completada en el rango"
              label="Clientes nuevos"
              value={String(clientesNuevos[0]?.total ?? 0)}
            />
            <Kpi
              hint={`${reservasWeb} llegaron por reserva web`}
              label="Reservas en línea"
              value={String(reservasWeb)}
            />
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
            <AdminCard
              actions={
                consolidado ? null : (
                  <Link className="text-sm font-medium text-[#8f3f2c] hover:underline" href={`/admin/ventas?${filtrosExport}`}>
                    Ver ventas →
                  </Link>
                )
              }
              description="Por importe vendido en ventas cobradas"
              title="Servicios más vendidos"
            >
              <Tabla
                encabezados={["Servicio", "Unidades", "Importe"]}
                filas={topServicios.map((row) => [row.nombre ?? "Servicio", String(row.unidades), fmt(row.importe)])}
                vacio="Sin servicios vendidos en el rango."
              />
            </AdminCard>
          </div>

          <AdminCard
            actions={
              consolidado ? null : (
                <Link className="text-sm font-medium text-[#8f3f2c] hover:underline" href={`/admin/agenda?${filtrosExport}`}>
                  Ver agenda →
                </Link>
              )
            }
            description="Citas agendadas por profesional"
            title="Productividad del equipo"
          >
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

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminCard description="De dónde vienen las citas del período" title="Origen de las citas">
              <Tabla
                encabezados={["Origen", "Citas"]}
                filas={citasPorOrigen
                  .sort((a, b) => b.total - a.total)
                  .map((row) => [ORIGEN_LABEL[row.origen] ?? row.origen, String(row.total)])}
                vacio="Sin citas en el rango."
              />
            </AdminCard>
            <AdminCard
              description="Avisos de correo generados en el período. «Aceptado» significa que el proveedor recibió el envío; no garantiza lectura."
              title="Avisos por correo"
            >
              <Tabla
                encabezados={["Estado", "Avisos"]}
                filas={[
                  ["Aceptados por el proveedor", String(avisosEnviados)],
                  ["Fallidos", String(avisosFallidos)],
                  ["Omitidos (obsoletos)", String(avisosOmitidos)],
                  ["En cola / enviando", String(avisosPendientes)],
                  ["Reintentos acumulados", String(avisosReintentos)],
                ]}
                vacio="Sin avisos generados en el rango."
              />
              {avisosFallidos > 0 ? (
                <p className="mt-3 rounded-xl bg-[#fbeaea] px-4 py-3 text-xs font-medium text-[#8f3f2c]">
                  {avisosFallidos} aviso(s) agotaron sus reintentos. Revisa los correos de tus clientes o contacta soporte.
                </p>
              ) : null}
            </AdminCard>
          </div>
        </>
      ) : null}

      {puedeFinancieros ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              hint={etiquetaDelta(deltaKpi(vendido, vendidoAnt))}
              label="Vendido"
              value={fmt(vendido)}
            />
            <Kpi
              hint={`${operaciones} venta(s)${operacionesAnt > 0 ? ` · ${etiquetaDelta(deltaKpi(operaciones, operacionesAnt))}` : ""}`}
              label="Ticket promedio"
              value={operaciones > 0 ? fmt(vendido / operaciones) : "—"}
            />
            <Kpi label="Propinas" value={fmt(propinasTotal)} />
            <Kpi
              hint={devolucionesOps > 0 ? `${devolucionesOps} devolución(es) por ${fmt(devolucionesTotal)} en el periodo` : "sin devoluciones en el periodo"}
              label="Devoluciones"
              value={fmt(devolucionesTotal)}
            />
            <Kpi
              label="Descuentos"
              value={fmt(descuentosTotal)}
              hint={`manual ${fmt(descuentosRow?.manual)} · promo ${fmt(descuentosRow?.promocion)} · membresía ${fmt(descuentosRow?.membresia)}`}
            />
            <Kpi
              hint={`${fmt(anticiposRow?.aplicados)} aplicados a ventas · ${fmt(anticiposRow?.vigentes)} vigentes`}
              label="Anticipos cobrados"
              value={fmt(anticiposRow?.cobrados)}
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

          {num(productosSinCosto[0]?.unidades) > 0 ? (
            <p className="rounded-xl border border-[#efd9a8] bg-[#fdf6e7] px-4 py-3 text-sm text-[#7a5b23]">
              {productosSinCosto[0]?.productos} producto(s) vendidos en el periodo no tienen costo capturado
              ({productosSinCosto[0]?.unidades} unidad(es)). El «resultado estimado» no descuenta costo de
              insumos — captura el costo en el catálogo para márgenes reales.
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminCard
              actions={
                consolidado ? null : (
                  <Link className="text-sm font-medium text-[#8f3f2c] hover:underline" href={`/admin/ventas?${filtrosExport}`}>
                    Ver historial →
                  </Link>
                )
              }
              description="Ventas cobradas por día"
              title="Ventas por día"
            >
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
            <AdminCard
              actions={
                consolidado ? null : (
                  <Link className="text-sm font-medium text-[#8f3f2c] hover:underline" href={`/admin/comisiones?${filtrosExport}`}>
                    Ver detalle →
                  </Link>
                )
              }
              description="Devengado en ventas cobradas vs. pagado (liquidaciones del periodo)"
              title="Comisiones y propinas por profesional"
            >
              <Tabla
                encabezados={["Profesional", "Devengado", "Pagado", "Propinas"]}
                filas={profesionalRows.map((row) => [
                  row.nombre,
                  fmt(row.comisiones),
                  fmt(row.liquidadas),
                  fmt(row.propinas),
                ])}
                vacio="Sin comisiones ni propinas en el rango."
              />
            </AdminCard>
            <AdminCard
              actions={
                consolidado ? null : (
                  <Link className="text-sm font-medium text-[#8f3f2c] hover:underline" href={`/admin/gastos?${filtrosExport}`}>
                    Ver detalle →
                  </Link>
                )
              }
              description="Gastos confirmados del periodo por categoría"
              title="Gastos por categoría"
            >
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
                  row.cerradoAt ? `${formatDate(row.cerradoAt, { timeZone: reportTimeZone })} ${formatTime(row.cerradoAt, { timeZone: reportTimeZone })}` : "—",
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
            ["Clientes nuevos", "Personas cuya primera atención completada cayó dentro del rango (no la fecha de alta en el sistema)."],
            ["Reservas en línea", "Citas creadas desde el portal público de reservas (origen web)."],
            ["Devoluciones", "Dinero devuelto a clientes por devoluciones registradas en el rango."],
            ["Anticipos cobrados", "Apartados cobrados en el rango. No son venta: se vuelven venta al aplicarse contra un cobro completado."],
            ["Periodo anterior", "Rango de la misma duración inmediatamente previo al seleccionado; se calcula idéntico."],
            ["Devengado", "Comisión generada por las ventas cobradas del rango, aunque aún no se pague."],
            ["Pagado", "Comisiones cuya liquidación se confirmó dentro del rango, aunque la venta sea de otra fecha."],
            ["Resultado estimado", "Vendido − gastos confirmados. No es utilidad contable: falta costo de productos e impuestos."],
            ["Diferencias de corte", "Cierres donde el efectivo contado no coincidió con el esperado del sistema."],
            ["Cobros por medio", "Pagos del rango por medio de pago, incluyendo correcciones de medio posteriores al cobro."],
            ["Avisos", "Correos de confirmación, cambio, cancelación y recordatorio generados en el rango. «Aceptado» = el proveedor recibió el envío; no garantiza que el cliente lo haya leído."],
            ["Todas las sucursales", "Vista consolidada: suma las operaciones de todas tus sucursales usando la zona horaria de la organización. El comparativo desglosa el aporte de cada sucursal con los mismos filtros."],
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
