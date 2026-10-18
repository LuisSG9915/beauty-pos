import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import Link from "next/link";

import { CategoriaGastoForm } from "@/app/admin/gastos/categoria-form";
import { GastoForm } from "@/app/admin/gastos/gasto-form";
import { RevertirGastoForm } from "@/app/admin/gastos/revertir-gasto-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, todayDateInput } from "@/lib/format";
import { buildAdminHref, firstParam, normalizeDateInput } from "@/lib/url-context";
import type { GastoRow } from "@/modules/gastos/queries";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";
import { shiftDateKey } from "@/modules/agenda";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const PAGE_SIZE = 40;
const ESTADO_LABEL: Record<string, string> = { confirmado: "Confirmado", revertido: "Revertido" };

/** Gastos del negocio: registro, categorías, filtros y reversión con motivo. */
export default async function GastosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, sucursalId, timeZone, currency, access } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();
  requireAccessPermission(access, "gastos.ver");
  const suscripcion = await contextoSuscripcion(organizationId);
  if (!suscripcion.capacidades.has("gastos")) {
    return (
      <PlanUpgradeNotice
        capacidad="gastos"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }
  const puedeEditar = hasPermission(access, "gastos.editar");

  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const estado = firstParam(params.estado);
  const estadoValido = estado === "confirmado" || estado === "revertido" ? estado : "";
  const categoriaId = firstParam(params.categoria) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? "1") || 1);

  const db = getDatabase();
  const filtroEstado = estadoValido ? sql` and g.estado = ${estadoValido}` : sql``;
  const filtroCategoria = categoriaId ? sql` and g.categoria_id = ${categoriaId}` : sql``;

  type GastoJson = Omit<GastoRow, "createdAt"> & { createdAt: string };
  type GastosSqlRow = {
    categorias: Array<{ id: string; nombre: string }>;
    medios: Array<{ id: string; nombre: string; categoria: string }>;
    gastos_rows: GastoJson[];
    confirmado: string;
    revertido: string;
  };

  // Categorías, medios de pago, listado paginado y totales del periodo en UNA
  // sola consulta SQL (antes 5 consultas simultáneas al pool).
  const { rows: sqlRows } = await db.execute<GastosSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select cg.id, cg.nombre
          from cat_categorias_gastos cg
          where cg.organizacion_id = ${organizationId} and cg.activo = true
          order by cg.nombre asc
        ) t
      ), '[]'::jsonb) as categorias,
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
            g.id,
            g.concepto,
            g.fecha_gasto::text as "fechaGasto",
            g.importe::text as importe,
            g.estado,
            g.proveedor,
            g.referencia,
            g.notas,
            cg.nombre as categoria,
            mp.nombre as medio,
            mp.categoria as "medioCategoria",
            (g.movimiento_caja_id is not null) as "cajaVinculada",
            u.nombre as "registradoPor",
            g.motivo_reversion as "motivoReversion",
            to_char(g.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
          from gastos g
          left join cat_categorias_gastos cg on cg.id = g.categoria_id
          join cat_medios_pago mp on mp.id = g.medio_pago_id
          left join usuarios u on u.id = g.usuario_id
          where g.organizacion_id = ${organizationId}
            and g.sucursal_id = ${sucursalId}
            and g.fecha_gasto >= ${desde}
            and g.fecha_gasto <= ${hasta}${filtroEstado}${filtroCategoria}
          order by g.fecha_gasto desc, g.created_at desc
          limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}
        ) t
      ), '[]'::jsonb) as gastos_rows,
      coalesce((
        select sum(g2.importe) filter (where g2.estado = 'confirmado')
        from gastos g2
        where g2.organizacion_id = ${organizationId}
          and g2.sucursal_id = ${sucursalId}
          and g2.fecha_gasto >= ${desde}
          and g2.fecha_gasto <= ${hasta}
      ), 0)::text as confirmado,
      coalesce((
        select sum(g3.importe) filter (where g3.estado = 'revertido')
        from gastos g3
        where g3.organizacion_id = ${organizationId}
          and g3.sucursal_id = ${sucursalId}
          and g3.fecha_gasto >= ${desde}
          and g3.fecha_gasto <= ${hasta}
      ), 0)::text as revertido
  `);

  const datos = sqlRows[0];
  const categorias = datos?.categorias ?? [];
  const medios = datos?.medios ?? [];
  const gastosRaw = (datos?.gastos_rows ?? []).map((g) => ({
    ...g,
    createdAt: new Date(g.createdAt),
  }));
  const listado = {
    rows: gastosRaw.slice(0, PAGE_SIZE),
    hasMore: gastosRaw.length > PAGE_SIZE,
  };
  const resumen = {
    totalConfirmado: Number(datos?.confirmado ?? 0),
    totalRevertido: Number(datos?.revertido ?? 0),
  };

  const fmt = (v: string | number) => formatCurrency(Number(v), { currency });
  const pageHref = (next: number) =>
    buildAdminHref("/gastos", {
      organizationId,
      sucursalId,
      extra: { desde, hasta, estado: estadoValido, categoria: categoriaId, page: String(next) },
    });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          puedeEditar ? (
            <Button
              data-action-clave="1"
              data-action-id="gastos.gasto.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/gastos", { organizationId, sucursalId, extra: { nuevo: "gasto" } })} />}
              size="lg"
            >
              Nuevo gasto
            </Button>
          ) : undefined
        }
        description={`${branch.nombre} · ${desde} → ${hasta}. Los gastos en efectivo descuentan del corte abierto; los demás medios no tocan el cajón.`}
        title="Gastos"
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
        <Field className="w-44">
          <FieldLabel>Categoría</FieldLabel>
          <Select defaultValue={categoriaId} name="categoria">
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
            ))}
          </Select>
        </Field>
        <Field className="w-40">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estadoValido} name="estado">
            <option value="">Todos</option>
            <option value="confirmado">Confirmados</option>
            <option value="revertido">Revertidos</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
      </form>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="anim-entrada rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-op-xs font-semibold uppercase tracking-wide text-muted-foreground">Gastos confirmados</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{fmt(resumen.totalConfirmado)}</p>
        </div>
        <div className="anim-entrada rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-op-xs font-semibold uppercase tracking-wide text-muted-foreground">Revertidos en el periodo</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">{fmt(resumen.totalRevertido)}</p>
        </div>
      </section>

      <div>
        <AdminCard
          actions={
            puedeEditar ? (
              <Button
                nativeButton={false}
                render={<Link href={buildAdminHref("/gastos", { organizationId, sucursalId, extra: { nuevo: "categoria" } })} />}
                size="sm"
                variant="outline"
              >
                Nueva categoría
              </Button>
            ) : undefined
          }
          className="self-start"
          description={`${listado.rows.length} gasto(s) en esta página`}
          title="Gastos del periodo"
        >
          {listado.rows.length === 0 ? (
            <EmptyState description="Prueba otro rango o registra el primer gasto del negocio." title="Sin gastos" />
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {listado.rows.map((gasto, index) => (
                  <article className="anim-entrada rounded-xl border border-border p-4" key={gasto.id} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 text-foreground">{gasto.concepto}</h3>
                        <p className="mt-0.5 text-op-xs leading-5 text-muted-foreground">
                          {gasto.fechaGasto} · {gasto.categoria ?? "Sin categoría"}
                        </p>
                      </div>
                      <StatusBadge tone={gasto.estado === "confirmado" ? "success" : "neutral"}>
                        {ESTADO_LABEL[gasto.estado] ?? gasto.estado}
                      </StatusBadge>
                    </div>
                    {[gasto.proveedor, gasto.referencia, gasto.registradoPor].filter(Boolean).length > 0 ? (
                      <p className="mt-1.5 text-op-xs text-muted-foreground">
                        {[gasto.proveedor, gasto.referencia, gasto.registradoPor].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    {gasto.motivoReversion ? (
                      <p className="mt-0.5 text-op-xs text-destructive">Reversión: {gasto.motivoReversion}</p>
                    ) : null}
                    <dl className="mt-3 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="shrink-0 text-op-xs text-muted-foreground">Importe</dt>
                        <dd className="min-w-0 text-right font-semibold tabular-nums text-foreground">{fmt(gasto.importe)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="shrink-0 text-op-xs text-muted-foreground">Medio</dt>
                        <dd className="min-w-0 text-right text-op-xs text-muted-foreground">
                          {gasto.medio}{gasto.cajaVinculada ? " · caja" : ""}
                        </dd>
                      </div>
                    </dl>
                    {puedeEditar && gasto.estado === "confirmado" ? (
                      <div className="mt-3 border-t border-border pt-3">
                        <RevertirGastoForm
                          concepto={gasto.concepto}
                          gastoId={gasto.id}
                          organizationId={organizationId}
                        />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 pr-4 font-medium">Concepto</th>
                    <th className="py-2 pr-4 font-medium">Categoría</th>
                    <th className="py-2 pr-4 font-medium">Medio</th>
                    <th className="py-2 pr-4 text-right font-medium">Importe</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    {puedeEditar ? <th className="py-2 font-medium">Acción</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {listado.rows.map((gasto) => (
                    <tr className="border-b border-border align-top" key={gasto.id}>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{gasto.fechaGasto}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground">{gasto.concepto}</p>
                        <p className="mt-0.5 text-op-xs text-muted-foreground">
                          {[gasto.proveedor, gasto.referencia, gasto.registradoPor].filter(Boolean).join(" · ")}
                        </p>
                        {gasto.motivoReversion ? (
                          <p className="mt-0.5 text-op-xs text-destructive">Reversión: {gasto.motivoReversion}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{gasto.categoria ?? "Sin categoría"}</td>
                      <td className="py-3 pr-4">
                        <span className="text-muted-foreground">{gasto.medio}</span>
                        {gasto.cajaVinculada ? (
                          <span className="ml-1 text-op-xs text-muted-foreground" title="Salió del corte de caja">· caja</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">{fmt(gasto.importe)}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge tone={gasto.estado === "confirmado" ? "success" : "neutral"}>
                          {ESTADO_LABEL[gasto.estado] ?? gasto.estado}
                        </StatusBadge>
                      </td>
                      {puedeEditar ? (
                        <td className="py-3">
                          {gasto.estado === "confirmado" ? (
                            <RevertirGastoForm
                              concepto={gasto.concepto}
                              gastoId={gasto.id}
                              organizationId={organizationId}
                            />
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          {page > 1 || listado.hasMore ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <a className="inline-flex min-h-6 items-center font-medium text-primary hover:underline" href={pageHref(page - 1)}>← Anterior</a>
              ) : <span />}
              {listado.hasMore ? (
                <a className="inline-flex min-h-6 items-center font-medium text-primary hover:underline" href={pageHref(page + 1)}>Siguiente →</a>
              ) : <span />}
            </div>
          ) : null}
        </AdminCard>
      </div>

      {puedeEditar && firstParam(params.nuevo) === "gasto" ? (
        <FormSheet
          closeHref={buildAdminHref("/gastos", { organizationId, sucursalId })}
          description="En efectivo descuenta del corte abierto; los demás medios no tocan el cajón."
          title="Registrar gasto"
        >
          <GastoForm
            categorias={categorias}
            fechaHoy={hoy}
            medios={medios}
            organizationId={organizationId}
            sucursalId={sucursalId}
          />
        </FormSheet>
      ) : null}
      {puedeEditar && firstParam(params.nuevo) === "categoria" ? (
        <FormSheet
          closeHref={buildAdminHref("/gastos", { organizationId, sucursalId })}
          description="Renta, insumos, sueldos, mantenimiento…"
          title="Nueva categoría de gasto"
        >
          <CategoriaGastoForm organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
