import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNavTabs, CAJA_VENTAS_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime, todayDateInput } from "@/lib/format";
import { buildAdminHref, firstParam, normalizeDateInput } from "@/lib/url-context";
import { GLOSARIO } from "@/lib/glosario";
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

  const filtroEstado = estado ? sql` and v.estado = ${estado}` : sql``;
  // Con búsqueda por cliente el join entra al CTE (filtra antes del top-k);
  // sin búsqueda se difiere al SELECT externo y solo busca las ≤41 filas de
  // la página. Alias distinto (`clq`) para no colisionar con el join externo.
  const joinClientesFiltro = q ? sql`left join clientes clq on clq.id = v.cliente_id` : sql``;
  const filtroBusqueda = q
    ? sql` and (clq.nombre ilike ${`%${q}%`} or clq.apellido_paterno ilike ${`%${q}%`}
        or clq.apellido_materno ilike ${`%${q}%`}${UUID_RE.test(q) ? sql` or v.id = ${q}` : sql``})`
    : sql``;

  type VentaJson = {
    id: string;
    estado: string;
    total: string;
    propina: string;
    fecha: string;
    clienteNombre: string | null;
    clienteApellidoPaterno: string | null;
    vendedorNombre: string | null;
    articulos: number;
  };

  // `ventas_pagina AS MATERIALIZED` acota primero (LIMIT/OFFSET) y solo
  // después resuelve cliente/vendedor y cuenta los artículos de esas filas:
  // antes los 4 subselects correlacionados encadenaban 8 lookup joins en
  // serie sobre todo el rango antes del top-k. Los artículos se agregan en un
  // solo CTE con `UNION ALL` (una pasada por tabla, acotada a la página).
  const db = getDatabase();
  const { rows: sqlRows } = await db.execute<VentaJson>(sql`
    with ventas_pagina as materialized (
      select
        v.id,
        v.estado,
        v.total,
        v.propina,
        coalesce(v.cobrada_at, v.created_at) as fecha_venta,
        v.cliente_id,
        v.usuario_id
      from ventas v
      ${joinClientesFiltro}
      where v.organizacion_id = ${organizationId}
        and v.sucursal_id = ${sucursalId}
        and v.activo = true
        and coalesce(v.cobrada_at, v.created_at) >= ${boundsDesde.iniciaAt}
        and coalesce(v.cobrada_at, v.created_at) < ${boundsHasta.terminaAt}${filtroEstado}${filtroBusqueda}
      order by coalesce(v.cobrada_at, v.created_at) desc, v.id desc
      limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}
    ),
    articulos_por_venta as materialized (
      select venta_id, sum(cantidad)::int as articulos
      from (
        select dvs.venta_id, dvs.cantidad
          from detalle_ventas_servicios dvs
         where dvs.activo and dvs.venta_id in (select id from ventas_pagina)
        union all
        select dvp.venta_id, dvp.cantidad
          from detalle_ventas_productos dvp
         where dvp.activo and dvp.venta_id in (select id from ventas_pagina)
        union all
        select dvq.venta_id, dvq.cantidad
          from detalle_ventas_paquetes dvq
         where dvq.activo and dvq.venta_id in (select id from ventas_pagina)
        union all
        select dvm.venta_id, dvm.cantidad
          from detalle_ventas_membresias dvm
         where dvm.activo and dvm.venta_id in (select id from ventas_pagina)
      ) todos
      group by venta_id
    )
    select
      vp.id,
      vp.estado,
      vp.total::text as total,
      vp.propina::text as propina,
      to_char(vp.fecha_venta at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fecha,
      cl.nombre as "clienteNombre",
      cl.apellido_paterno as "clienteApellidoPaterno",
      u.nombre as "vendedorNombre",
      coalesce(av.articulos, 0) as articulos
    from ventas_pagina vp
    left join clientes cl on cl.id = vp.cliente_id
    left join usuarios u on u.id = vp.usuario_id
    left join articulos_por_venta av on av.venta_id = vp.id
    order by vp.fecha_venta desc, vp.id desc
  `);

  const rows = sqlRows.map((r) => ({ ...r, fecha: new Date(r.fecha) }));
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

  type VentaRow = (typeof pageRows)[number];
  const estadoVentaDe = (venta: VentaRow) =>
    ESTADOS.includes(venta.estado as (typeof ESTADOS)[number])
      ? (venta.estado as (typeof ESTADOS)[number])
      : "en_proceso";
  const ticketHref = (ventaId: string) =>
    buildAdminHref("/pos", {
      organizationId,
      sucursalId,
      extra: { ventaId, returnTo: currentHref },
    });

  const columns: Array<DataTableColumn<VentaRow>> = [
    {
      id: "fecha",
      header: "Fecha de cobro",
      cell: (venta) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(venta.fecha, { timeZone })} · {formatTime(venta.fecha, { timeZone })}
        </span>
      ),
    },
    {
      id: "cliente",
      header: "Cliente",
      cell: (venta) => (
        <p className="font-medium text-foreground">
          {[venta.clienteNombre, venta.clienteApellidoPaterno].filter(Boolean).join(" ") || GLOSARIO.clienteDePaso}
        </p>
      ),
    },
    {
      id: "vendedor",
      header: "Vendedor",
      cell: (venta) => <span className="text-muted-foreground">{venta.vendedorNombre ?? "—"}</span>,
      hideBelow: "lg",
    },
    {
      id: "articulos",
      header: "Artículos",
      cell: (venta) => <span className="tabular-nums text-muted-foreground">{venta.articulos}</span>,
      align: "right",
    },
    {
      id: "estado",
      header: "Estado",
      cell: (venta) => {
        const estadoVenta = estadoVentaDe(venta);
        return <StatusBadge tone={ESTADO_TONE[estadoVenta]}>{ESTADO_LABEL[estadoVenta]}</StatusBadge>;
      },
    },
    {
      id: "total",
      header: "Total",
      cell: (venta) => (
        <span className="font-semibold tabular-nums">
          {formatCurrency(Number(venta.total) + Number(venta.propina), { currency })}
        </span>
      ),
      align: "right",
    },
    {
      id: "accion",
      header: "Acción",
      cell: (venta) => (
        <Link
          className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-op-xs font-medium text-primary hover:bg-muted/60"
          data-action-id="ventas.ticket.abrir"
          href={ticketHref(venta.id)}
        >
          Abrir ticket
        </Link>
      ),
      align: "right",
      stickyEnd: true,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="ventas.nueva"
            nativeButton={false}
            render={
              <Link
                href={buildAdminHref("/pos", {
                  organizationId,
                  sucursalId,
                  extra: { nueva: "1" },
                })}
              />
            }
          >
            Nueva venta
          </Button>
        }
        description={`${branch.nombre} · ${desde} → ${hasta}. La fecha mostrada es el cobro confirmado; las ventas antiguas usan su fecha de creación.`}
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            sucursalId={sucursalId}
            tabs={CAJA_VENTAS_TABS}
          />
        }
        title="Historial de ventas"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <input name="sucursalId" type="hidden" value={sucursalId} />
        <Field className="w-full sm:w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Field className="w-full sm:w-44">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            {ESTADOS.map((value) => <option key={value} value={value}>{ESTADO_LABEL[value]}</option>)}
          </Select>
        </Field>
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel>Buscar cliente</FieldLabel>
          <Input defaultValue={q} name="q" placeholder="Nombre del cliente" />
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState description="Prueba otro rango, estado o búsqueda. Las ventas abiertas también aparecen aquí." title="No hay ventas" />
      ) : (
        <>
          <RegistroList>
            {pageRows.map((venta) => {
              const estadoVenta = estadoVentaDe(venta);
              const cliente = [venta.clienteNombre, venta.clienteApellidoPaterno].filter(Boolean).join(" ") || GLOSARIO.clienteDePaso;
              return (
                <RegistroCard
                  acciones={
                    <Link
                      className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-op-xs font-medium text-primary hover:bg-muted/60"
                      data-action-id="ventas.ticket.abrir"
                      href={ticketHref(venta.id)}
                    >
                      Abrir ticket
                    </Link>
                  }
                  badge={<StatusBadge tone={ESTADO_TONE[estadoVenta]}>{ESTADO_LABEL[estadoVenta]}</StatusBadge>}
                  campos={[
                    { label: "Cobro", value: `${formatDate(venta.fecha, { timeZone })} · ${formatTime(venta.fecha, { timeZone })}` },
                    ...(venta.vendedorNombre ? [{ label: "Vendedor", value: venta.vendedorNombre }] : []),
                    { label: "Artículos", value: String(venta.articulos) },
                    { label: "Total", value: formatCurrency(Number(venta.total) + Number(venta.propina), { currency }) },
                  ]}
                  key={venta.id}
                  titulo={cliente}
                />
              );
            })}
          </RegistroList>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <DataTable
              columns={columns}
              minWidth="860px"
              rowKey={(venta) => venta.id}
              rows={pageRows}
            />
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 ? <Button nativeButton={false} render={<Link href={pageHref(page - 1)} />} variant="outline">← Anterior</Button> : null}
          {hasMore ? <Button nativeButton={false} render={<Link href={pageHref(page + 1)} />} variant="outline">Siguiente →</Button> : null}
        </div>
      </div>
    </div>
  );
}
