import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { ventas } from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime, todayDateInput } from "@/lib/format";
import { buildAdminHref, firstParam, normalizeDateInput } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey } from "@/modules/agenda";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const ESTADOS = ["en_proceso", "completada", "cancelada"] as const;
const ESTADO_LABEL: Record<(typeof ESTADOS)[number], string> = {
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
};
const ESTADO_TONE: Record<(typeof ESTADOS)[number], StatusTone> = {
  en_proceso: "warning",
  completada: "success",
  cancelada: "destructive",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = Promise<AdminSearchParams>;

/** Historial paginado de ventas de la sucursal activa. */
export default async function VentasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, sucursalId, timeZone, currency } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();
  requireAccessPermission(context.access, "ventas.ver");

  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(params.desde, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(params.hasta, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) notFound();

  const q = firstParam(params.q) ?? "";
  const estado = ESTADOS.includes(firstParam(params.estado) as (typeof ESTADOS)[number])
    ? (firstParam(params.estado) as (typeof ESTADOS)[number])
    : "";
  const page = Math.max(1, Number(firstParam(params.page) ?? "1") || 1);
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const conditions = [
    eq(ventas.organizacionId, organizationId),
    eq(ventas.sucursalId, sucursalId),
    eq(ventas.activo, true),
    gte(fechaVenta, boundsDesde.iniciaAt),
    lt(fechaVenta, boundsHasta.terminaAt),
  ];
  if (estado) conditions.push(eq(ventas.estado, estado));
  if (q) {
    const searchConditions = [
      ilike(clientes.nombre, `%${q}%`),
      ilike(clientes.apellidoPaterno, `%${q}%`),
      ilike(clientes.apellidoMaterno, `%${q}%`),
    ];
    if (UUID_RE.test(q)) searchConditions.push(eq(ventas.id, q));
    conditions.push(or(...searchConditions)!);
  }

  const db = getDatabase();
  const rows = await db
    .select({
      id: ventas.id,
      estado: ventas.estado,
      total: ventas.total,
      propina: ventas.propina,
      fecha: fechaVenta,
      clienteNombre: clientes.nombre,
      clienteApellidoPaterno: clientes.apellidoPaterno,
    })
    .from(ventas)
    .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
    .where(and(...conditions))
    .orderBy(desc(fechaVenta), desc(ventas.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const currentHref = buildAdminHref("/ventas", {
    organizationId,
    sucursalId,
    extra: { desde, hasta, estado, q, page: String(page) },
  });
  const pageHref = (nextPage: number) =>
    buildAdminHref("/ventas", {
      organizationId,
      sucursalId,
      extra: { desde, hasta, estado, q, page: String(nextPage) },
    });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/pos", { organizationId, sucursalId })} />}>
            Nueva venta
          </Button>
        }
        description={`${branch.nombre} · ${desde} → ${hasta}. La fecha mostrada es el cobro confirmado; las ventas antiguas usan su fecha de creación.`}
        title="Historial de ventas"
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
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            {ESTADOS.map((value) => <option key={value} value={value}>{ESTADO_LABEL[value]}</option>)}
          </Select>
        </Field>
        <Field className="min-w-56 flex-1">
          <FieldLabel>Buscar cliente o ticket</FieldLabel>
          <Input defaultValue={q} name="q" placeholder="Nombre o UUID de venta" />
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState description="Prueba otro rango, estado o búsqueda. Las ventas abiertas también aparecen aquí." title="No hay ventas" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#eadfd8] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-[#eee6e0] bg-[#faf6f3] text-left text-xs uppercase tracking-wide text-[#8a7b72]">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha de cobro</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((venta) => {
                  const estadoVenta = ESTADOS.includes(venta.estado as (typeof ESTADOS)[number])
                    ? (venta.estado as (typeof ESTADOS)[number])
                    : "en_proceso";
                  const href = buildAdminHref("/pos", {
                    organizationId,
                    sucursalId,
                    extra: { ventaId: venta.id, returnTo: currentHref },
                  });
                  return (
                    <tr className="border-b border-[#f4eeea] last:border-0" key={venta.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-[#625b55]">
                        {formatDate(venta.fecha, { timeZone })} · {formatTime(venta.fecha, { timeZone })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#2d2926]">{[venta.clienteNombre, venta.clienteApellidoPaterno].filter(Boolean).join(" ") || "Walk-in"}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#a89d95]" title={venta.id}>{venta.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge tone={ESTADO_TONE[estadoVenta]}>{ESTADO_LABEL[estadoVenta]}</StatusBadge></td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCurrency(Number(venta.total) + Number(venta.propina), { currency })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link className="font-medium text-[#8a5140] hover:underline" href={href}>Abrir ticket</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[#81746c]">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 ? <Button nativeButton={false} render={<Link href={pageHref(page - 1)} />} variant="outline">← Anterior</Button> : null}
          {hasMore ? <Button nativeButton={false} render={<Link href={pageHref(page + 1)} />} variant="outline">Siguiente →</Button> : null}
        </div>
      </div>
    </div>
  );
}
