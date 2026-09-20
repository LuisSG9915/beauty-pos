import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { CategoriaGastoForm } from "@/app/admin/gastos/categoria-form";
import { GastoForm } from "@/app/admin/gastos/gasto-form";
import { RevertirGastoForm } from "@/app/admin/gastos/revertir-gasto-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { catCategoriasGastos } from "@/db/schema/finance";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, todayDateInput } from "@/lib/format";
import { buildAdminHref, firstParam, normalizeDateInput } from "@/lib/url-context";
import { listarGastos, resumenGastos } from "@/modules/gastos/queries";
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
  const [categorias, medios, listado, resumen] = await Promise.all([
    db
      .select({ id: catCategoriasGastos.id, nombre: catCategoriasGastos.nombre })
      .from(catCategoriasGastos)
      .where(and(eq(catCategoriasGastos.organizacionId, organizationId), eq(catCategoriasGastos.activo, true)))
      .orderBy(asc(catCategoriasGastos.nombre)),
    db
      .select({ id: catMediosPago.id, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria })
      .from(catMediosPago)
      .where(and(eq(catMediosPago.organizacionId, organizationId), eq(catMediosPago.activo, true)))
      .orderBy(asc(catMediosPago.nombre)),
    listarGastos(
      db,
      {
        organizacionId: organizationId,
        sucursalId,
        desde,
        hasta,
        estado: estadoValido || undefined,
        categoriaId: categoriaId || undefined,
      },
      { page, pageSize: PAGE_SIZE },
    ),
    resumenGastos(db, { organizacionId: organizationId, sucursalId, desde, hasta }),
  ]);

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
        description={`${branch.nombre} · ${desde} → ${hasta}. Los gastos en efectivo descuentan del corte abierto; los demás medios no tocan el cajón.`}
        title="Gastos"
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

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Gastos confirmados</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[#2d2926]">{fmt(resumen.totalConfirmado)}</p>
        </div>
        <div className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Revertidos en el periodo</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[#a8443a]">{fmt(resumen.totalRevertido)}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {puedeEditar ? (
          <div className="space-y-6 self-start">
            <GastoForm
              categorias={categorias}
              fechaHoy={hoy}
              medios={medios}
              organizationId={organizationId}
              sucursalId={sucursalId}
            />
            <CategoriaGastoForm organizationId={organizationId} />
          </div>
        ) : null}

        <AdminCard className="self-start" description={`${listado.rows.length} gasto(s) en esta página`} title="Gastos del periodo">
          {listado.rows.length === 0 ? (
            <EmptyState description="Prueba otro rango o registra el primer gasto del negocio." title="Sin gastos" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
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
                    <tr className="border-b border-[#f1eeea] align-top" key={gasto.id}>
                      <td className="whitespace-nowrap py-3 pr-4 text-[#625b55]">{gasto.fechaGasto}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-[#2d2926]">{gasto.concepto}</p>
                        <p className="mt-0.5 text-xs text-[#a89d95]">
                          {[gasto.proveedor, gasto.referencia, gasto.registradoPor].filter(Boolean).join(" · ")}
                        </p>
                        {gasto.motivoReversion ? (
                          <p className="mt-0.5 text-xs text-[#a8443a]">Reversión: {gasto.motivoReversion}</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-[#625b55]">{gasto.categoria ?? "Sin categoría"}</td>
                      <td className="py-3 pr-4">
                        <span className="text-[#625b55]">{gasto.medio}</span>
                        {gasto.cajaVinculada ? (
                          <span className="ml-1 text-xs text-[#a89d95]" title="Salió del corte de caja">· caja</span>
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
          )}
          {page > 1 || listado.hasMore ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <a className="font-medium text-[#8a5140] hover:underline" href={pageHref(page - 1)}>← Anterior</a>
              ) : <span />}
              {listado.hasMore ? (
                <a className="font-medium text-[#8a5140] hover:underline" href={pageHref(page + 1)}>Siguiente →</a>
              ) : <span />}
            </div>
          ) : null}
        </AdminCard>
      </div>
    </div>
  );
}
