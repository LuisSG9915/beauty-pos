import { sql } from "drizzle-orm";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";

import { AperturaCajaForm } from "@/app/admin/caja/apertura-caja-form";
import { CierreCajaForm } from "@/app/admin/caja/cierre-caja-form";
import { MovimientoCajaForm } from "@/app/admin/caja/movimiento-caja-form";
import { PoliticaCajaToggle } from "@/app/admin/caja/politica-caja-toggle";
import { AdminNavTabs, CAJA_VENTAS_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime, todayDateInput } from "@/lib/format";
import { dayBoundsUtc } from "@/modules/agenda";
import { obtenerGananciaNetaPeriodo, type ResumenGananciaNeta } from "@/modules/reportes/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const num = (v: string | number | null | undefined) => Number(v ?? 0);

function TarjetaGananciaNeta({
  ganancia,
  currency,
  titulo,
  subtitulo,
}: {
  ganancia: ResumenGananciaNeta;
  currency: string;
  titulo: string;
  subtitulo: string;
}) {
  const fmt = (centavos: number) => formatCurrency(centavos / 100, { currency });
  const esPositivo = ganancia.utilidadNetaCentavos >= 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Total Ingresado */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
          <p className="text-op-xs font-medium text-muted-foreground">Total Ingresado</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
            {fmt(ganancia.totalIngresadoCentavos)}
          </p>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            Efectivo {fmt(ganancia.efectivoCentavos)} · Tarjeta {fmt(ganancia.tarjetaCentavos)} · SPEI {fmt(ganancia.transferenciaCentavos)}
          </p>
        </div>

        {/* 2. Por Pagar a Equipo */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
          <p className="text-op-xs font-medium text-muted-foreground">Por Pagar a Equipo</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
            {fmt(ganancia.comisionesEquipoCentavos)}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Comisiones devengadas</p>
        </div>

        {/* 3. Gastos Operativos */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
          <p className="text-op-xs font-medium text-muted-foreground">Gastos Operativos</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
            {fmt(ganancia.gastosOperativosCentavos)}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Salidas de caja / gastos</p>
        </div>

        {/* 4. Utilidad Neta en Mano */}
        <div
          className={`rounded-xl border p-4 ${
            esPositivo
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-100"
              : "border-destructive/30 bg-destructive/10 text-destructive-foreground dark:bg-destructive/15"
          }`}
        >
          <p className="text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Utilidad Neta en Mano
          </p>
          <p
            className={`mt-1 text-2xl font-black tracking-tight tabular-nums ${
              esPositivo ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            }`}
          >
            {fmt(ganancia.utilidadNetaCentavos)}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
            {esPositivo ? "Disponible libre de compromisos" : "Déficit en el turno / día"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function CajaPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAdminContext(await searchParams);
  const { organization, branch, timeZone, currency } = context;
  if (!organization || !branch) notFound();
  requireAccessPermission(context.access, "caja.ver");

  const db = getDatabase();

  // Una sola ronda SQL para toda la pantalla: antes eran 9 consultas en dos
  // Promise.all (~4 conexiones frías + RTs). El CTE `corte_abierto` evita
  // repetir el subselect del turno vigente; el historial lleva sus detalles
  // y totales anidados en jsonb por corte.
  // En corte abierto solo contamos ventas: mostrar importes rompería el cierre
  // ciego. Los movimientos del turno se listan (el cajero los registró) sin
  // sumarlos al esperado visible — el esperado solo se revela al confirmar.
  type CajaRow = {
    exigirCorteParaCobrar: boolean | null;
    corteAbierto: {
      id: string;
      fondoInicial: string;
      createdAt: string;
      notas: string | null;
    } | null;
    medios: Array<{ id: string; nombre: string; categoria: string }>;
    historial: Array<{
      id: string;
      fondoInicial: string;
      createdAt: string;
      cerradoAt: string | null;
      notas: string | null;
      abiertoPor: string | null;
      detalles: Array<{
        medioNombre: string;
        esperado: string;
        contado: string;
        diferencia: string;
      }>;
      ventasCount: number;
      ventasTotal: string;
      propinas: string;
      comisionesTotal: string;
    }>;
    ventasDelCorte: number;
    movimientosTurno: Array<{
      id: string;
      tipo: string;
      monto: string;
      notas: string | null;
      createdAt: string;
      medioNombre: string;
      usuarioNombre: string;
    }>;
  };
  const hoyKey = todayDateInput(timeZone);
  const boundsHoy = dayBoundsUtc(hoyKey, timeZone);
  const desdeHoy = boundsHoy?.iniciaAt ?? new Date();
  const hastaHoy = boundsHoy?.terminaAt ?? new Date();

  const [result, gananciaHoy] = await Promise.all([
    db.execute<CajaRow>(sql`
    with corte_abierto as materialized (
      select cc.id, cc.fondo_inicial, cc.created_at, cc.notas
        from cortes_caja cc
       where cc.sucursal_id = ${branch.id}
         and cc.estado = 'abierto'
         and cc.activo
       limit 1
    ),
    -- Materializa los 10 cortes recientes ANTES de los agregados: sin esto,
    -- Cockroach evalúa los subselects de ventas sobre todo el historial de
    -- cortes de la sucursal y aplica el top-k al final.
    ultimos_cortes as materialized (
      select cc.id, cc.fondo_inicial, cc.created_at, cc.cerrado_at, cc.notas,
             u.nombre as abierto_por
        from cortes_caja cc
        left join usuarios u on cc.usuario_id = u.id
       where cc.sucursal_id = ${branch.id}
         and cc.estado = 'cerrado'
         and cc.activo
       order by cc.cerrado_at desc
       limit 10
    )
    select
      (select s.exigir_corte_para_cobrar from sucursales s
        where s.id = ${branch.id}) as "exigirCorteParaCobrar",
      (select jsonb_build_object(
          'id', ca.id,
          'fondoInicial', ca.fondo_inicial::text,
          'createdAt', to_char(ca.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'notas', ca.notas)
        from corte_abierto ca) as "corteAbierto",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', mp.id, 'nombre', mp.nombre, 'categoria', mp.categoria)
          order by mp.nombre)
          from cat_medios_pago mp
         where mp.organizacion_id = ${organization.id} and mp.activo
      ), '[]'::jsonb) as medios,
      coalesce((
        select jsonb_agg(t) from (
          select
            uc.id,
            uc.fondo_inicial::text as "fondoInicial",
            to_char(uc.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            case when uc.cerrado_at is null then null
                 else to_char(uc.cerrado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as "cerradoAt",
            uc.notas,
            uc.abierto_por as "abiertoPor",
            coalesce((
              select jsonb_agg(jsonb_build_object(
                  'medioNombre', mp.nombre,
                  'esperado', dc.esperado::text,
                  'contado', dc.contado::text,
                  'diferencia', dc.diferencia::text))
                from detalle_cortes dc
                join cat_medios_pago mp on dc.medio_pago_id = mp.id
               where dc.corte_id = uc.id
            ), '[]'::jsonb) as detalles,
            agg."ventasCount",
            agg."ventasTotal",
            agg.propinas,
            (select coalesce(sum(dvc.monto), 0)::text
               from detalle_ventas_comisiones dvc
               join ventas v on dvc.venta_id = v.id
              where v.corte_id = uc.id and dvc.activo) as "comisionesTotal"
          from ultimos_cortes uc
          -- Una sola pasada por ventas por corte: antes eran 3 subselects
          -- correlacionados que el optimizador encadenaba como 3 lookup joins.
          cross join lateral (
            select count(*)::int as "ventasCount",
                   coalesce(sum(v.total), 0)::text as "ventasTotal",
                   coalesce(sum(v.propina), 0)::text as propinas
              from ventas v
             where v.corte_id = uc.id and v.estado = 'completada' and v.activo
          ) agg
          order by uc.cerrado_at desc
        ) t
      ), '[]'::jsonb) as historial,
      coalesce((
        select count(*)::int from ventas v
         where v.corte_id = (select id from corte_abierto)
           and v.estado = 'completada' and v.activo
      ), 0) as "ventasDelCorte",
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', mc.id,
            'tipo', mc.tipo,
            'monto', mc.monto::text,
            'notas', mc.notas,
            'createdAt', to_char(mc.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'medioNombre', mp.nombre,
            'usuarioNombre', u.nombre)
          order by mc.created_at desc)
          from movimientos_caja mc
          join cat_medios_pago mp on mc.medio_pago_id = mp.id
          join usuarios u on mc.usuario_id = u.id
         where mc.corte_id = (select id from corte_abierto)
      ), '[]'::jsonb) as "movimientosTurno"
  `),
    obtenerGananciaNetaPeriodo({
      organizacionId: organization.id,
      sucursalId: branch.id,
      desde: desdeHoy,
      hasta: hastaHoy,
    }),
  ]);

  const data = result.rows[0];
  const sucursalRow = { exigirCorteParaCobrar: data?.exigirCorteParaCobrar ?? false };
  const corteAbierto = data?.corteAbierto ?? null;
  const medios = data?.medios ?? [];
  const historial = data?.historial ?? [];
  const movimientosTurno = data?.movimientosTurno ?? [];
  const ventasDelCorte = { count: data?.ventasDelCorte ?? 0 };

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

      <TarjetaGananciaNeta
        currency={currency}
        ganancia={gananciaHoy}
        subtitulo="Ventas cobradas menos comisiones devengadas y gastos del día en esta sucursal."
        titulo="Tu Ganancia Real de Hoy (Caja Neta)"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {corteAbierto ? (
          <div className="space-y-6 self-start">
            <AdminCard
              animate
              description={`Abierta ${formatDate(corteAbierto.createdAt, { timeZone })} ${formatTime(corteAbierto.createdAt, { timeZone })} · Fondo ${fmt(corteAbierto.fondoInicial)} · ${ventasDelCorte.count} venta(s) cobrada(s)`}
              title="Caja abierta — conteo del turno"
            >
              <CierreCajaForm corteId={corteAbierto.id} currency={currency} medios={medios} organizationId={organization.id} />
            </AdminCard>

            <AdminCard
              animate
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
                  {movimientosTurno.map((mov, index) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-sm anim-entrada"
                      key={mov.id}
                      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium capitalize text-foreground">{mov.tipo}</p>
                        <p className="text-op-xs text-muted-foreground">
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
          <AdminCard animate className="self-start" description="Registra el fondo inicial para empezar a asociar ventas." title="Abrir caja">
            <AperturaCajaForm organizationId={organization.id} sucursalId={branch.id} />
          </AdminCard>
        )}

        <AdminCard animate className="self-start" description="Auditoría de arqueo ciego: esperado vs. contado físico por medio de pago." title="Cortes recientes">
          {historial.length === 0 ? (
            <EmptyState description="Aquí aparecerán los cortes cerrados con su reporte de discrepancias y arqueo." title="Sin cortes aún" />
          ) : (
            <ul className="space-y-4">
              {historial.map((corte, index) => {
                const detallesList = corte.detalles;
                const diferenciaTotal = detallesList.reduce((s, d) => s + num(d.diferencia), 0);
                const esCuadrado = Math.abs(diferenciaTotal) < 0.01;
                const esFaltante = diferenciaTotal <= -0.01;

                return (
                  <li
                    className={`rounded-2xl border p-4 transition-colors anim-entrada ${
                      index === 0 ? "border-primary/30 bg-card shadow-xs" : "border-border bg-card"
                    }`}
                    key={corte.id}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {formatDate(corte.createdAt, { timeZone })} · {formatTime(corte.createdAt, { timeZone })} →{" "}
                          {corte.cerradoAt ? formatTime(corte.cerradoAt, { timeZone }) : "—"}
                        </p>
                        {index === 0 ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-op-xs font-semibold text-primary">
                            Último corte
                          </span>
                        ) : null}
                      </div>

                      {esCuadrado ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-op-xs font-semibold text-success-soft-foreground">
                          <CheckCircle2 className="size-3.5 text-success" />
                          Arqueo cuadrado
                        </span>
                      ) : esFaltante ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2.5 py-0.5 text-op-xs font-semibold text-destructive-soft-foreground">
                          <AlertCircle className="size-3.5 text-destructive" />
                          Faltante de -{fmt(Math.abs(diferenciaTotal))}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-op-xs font-semibold text-warning-soft-foreground">
                          <AlertTriangle className="size-3.5 text-warning" />
                          Sobrante de +{fmt(diferenciaTotal)}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-op-xs text-muted-foreground">
                      Responsable: {corte.abiertoPor ?? "—"} · Fondo inicial: {fmt(corte.fondoInicial)} · {corte.ventasCount} venta(s) cobrada(s) ({fmt(corte.ventasTotal)}) ·{" "}
                      {fmt(corte.propinas)} propinas · {fmt(corte.comisionesTotal)} comisiones
                    </p>

                    {/* Móvil: desglose como lista (la tabla de 5 columnas
                        desborda en 390px); desde sm se conserva la tabla. */}
                    <ul className="mt-3 space-y-2 sm:hidden">
                      {detallesList.map((d, i) => {
                        const dif = num(d.diferencia);
                        const itemCuadrado = Math.abs(dif) < 0.01;
                        const itemFaltante = dif <= -0.01;
                        return (
                          <li className="rounded-xl border border-border px-3.5 py-2.5 text-sm" key={i}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-foreground">{d.medioNombre}</span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-op-xs font-medium ${
                                  itemCuadrado
                                    ? "bg-success-soft text-success-soft-foreground"
                                    : itemFaltante
                                      ? "bg-destructive-soft text-destructive-soft-foreground"
                                      : "bg-warning-soft text-warning-soft-foreground"
                                }`}
                              >
                                {itemCuadrado ? "Cuadrado" : itemFaltante ? "Faltante" : "Sobrante"}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3 text-op-xs text-muted-foreground">
                              <span>
                                Esperado <span className="tabular-nums">{fmt(d.esperado)}</span> · Contado{" "}
                                <span className="tabular-nums font-semibold text-foreground">{fmt(d.contado)}</span>
                              </span>
                              <span className="tabular-nums font-semibold">
                                {itemCuadrado ? "$0.00" : (dif > 0 ? "+" : "") + fmt(dif)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-3 hidden overflow-x-auto sm:block">
                      <table className="w-full text-left text-sm">
                        <thead className="text-op-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                          <tr>
                            <th className="py-1.5 pr-3 font-semibold">Medio de pago</th>
                            <th className="py-1.5 pr-3 text-right font-semibold">Esperado</th>
                            <th className="py-1.5 pr-3 text-right font-semibold">Contado</th>
                            <th className="py-1.5 pr-3 text-right font-semibold">Diferencia</th>
                            <th className="py-1.5 text-right font-semibold">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {detallesList.map((d, i) => {
                            const dif = num(d.diferencia);
                            const itemCuadrado = Math.abs(dif) < 0.01;
                            const itemFaltante = dif <= -0.01;

                            return (
                              <tr className="hover:bg-muted/30 transition-colors" key={i}>
                                <td className="py-2 pr-3 font-medium text-foreground">{d.medioNombre}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{fmt(d.esperado)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums font-semibold text-foreground">{fmt(d.contado)}</td>
                                <td
                                  className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                                    itemCuadrado
                                      ? "text-success"
                                      : itemFaltante
                                      ? "text-destructive"
                                      : "text-warning"
                                  }`}
                                >
                                  {itemCuadrado ? "$0.00" : (dif > 0 ? "+" : "") + fmt(dif)}
                                </td>
                                <td className="py-2 text-right">
                                  {itemCuadrado ? (
                                    <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-op-xs font-medium text-success-soft-foreground">
                                      Cuadrado
                                    </span>
                                  ) : itemFaltante ? (
                                    <span className="rounded-md bg-destructive-soft px-1.5 py-0.5 text-op-xs font-medium text-destructive-soft-foreground">
                                      Faltante
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-op-xs font-medium text-warning-soft-foreground">
                                      Sobrante
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {corte.notas ? (
                      <p className="mt-2.5 rounded-lg bg-muted/40 px-3 py-1.5 text-op-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Notas de cierre:</span> {corte.notas}
                      </p>
                    ) : null}
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
