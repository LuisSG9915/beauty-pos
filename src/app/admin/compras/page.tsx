import { sql } from "drizzle-orm";
import { Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { COMPRA_ESTADOS, type CompraEstado } from "@/db/schema/compras";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { COMPRA_ESTADO_INFO } from "@/modules/compras";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

/**
 * Lista de compras de la sucursal activa (plan 10): chips por estado con
 * conteo, las `con_observacion` siempre arriba y resaltadas. La acción
 * primaria es "Nueva compra" (foto del ticket o captura manual).
 */
export default async function ComprasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId } = context;

  if (!organization) notFound();
  requireAccessPermission(context.access, "compras.ver");

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Tickets de proveedores y recepción de mercancía." title="Compras" />
        <EmptyState description={`${organization.nombre} no tiene sucursales activas.`} title="Sin sucursal activa" />
      </div>
    );
  }

  const estadoFiltro = firstParam(params.estado);
  const estadoValido = COMPRA_ESTADOS.includes(estadoFiltro as CompraEstado)
    ? (estadoFiltro as CompraEstado)
    : undefined;

  const db = getDatabase();
  const filtroEstado = estadoValido ? sql` and c.estado = ${estadoValido}` : sql``;

  type CompraRowJson = {
    id: string;
    estado: string;
    fechaCompra: string | null;
    createdAt: string;
    folio: string | null;
    proveedorTexto: string | null;
    proveedorNombre: string | null;
    totalTicket: string | null;
    totalCalculado: string;
    recibidaPor: string | null;
    numLineas: number;
  };
  type ComprasSqlRow = {
    compras: CompraRowJson[];
    conteos: Array<{ estado: string; total: number }>;
  };

  // Listado de compras (con conteo de líneas acotado a la página) + conteo
  // por estado en UNA sola consulta SQL con CTEs materializados.
  const { rows: sqlRows } = await db.execute<ComprasSqlRow>(sql`
    with compras_pagina as materialized (
      select
        c.id,
        c.estado,
        c.fecha_compra::text as "fechaCompra",
        to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        c.folio,
        c.proveedor_texto as "proveedorTexto",
        pr.nombre as "proveedorNombre",
        c.total_ticket::text as "totalTicket",
        c.total_calculado::text as "totalCalculado",
        u.nombre as "recibidaPor",
        row_number() over (
          order by case when c.estado = 'con_observacion' then 0 else 1 end desc, c.created_at desc
        ) as rn
      from compras c
      left join proveedores pr on pr.id = c.proveedor_id
      left join usuarios u on u.id = c.recibida_por
      where c.organizacion_id = ${organization.id}
        and c.sucursal_id = ${branch.id}
        and c.activo = true${filtroEstado}
      order by case when c.estado = 'con_observacion' then 0 else 1 end desc, c.created_at desc
      limit 100
    ),
    lineas_por_compra as materialized (
      select d.compra_id, count(*)::int as num_lineas
      from compras_pagina cp
      join detalle_compras d on d.compra_id = cp.id and d.activo = true
      group by d.compra_id
    )
    select
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', cp.id,
            'estado', cp.estado,
            'fechaCompra', cp."fechaCompra",
            'createdAt', cp."createdAt",
            'folio', cp.folio,
            'proveedorTexto', cp."proveedorTexto",
            'proveedorNombre', cp."proveedorNombre",
            'totalTicket', cp."totalTicket",
            'totalCalculado', cp."totalCalculado",
            'recibidaPor', cp."recibidaPor",
            'numLineas', coalesce(lpc.num_lineas, 0)
          )
          order by cp.rn
        )
        from compras_pagina cp
        left join lineas_por_compra lpc on lpc.compra_id = cp.id
      ), '[]'::jsonb) as compras,
      coalesce((
        select jsonb_agg(jsonb_build_object('estado', estado, 'total', total))
        from (
          select c2.estado, count(*)::int as total
          from compras c2
          where c2.organizacion_id = ${organization.id}
            and c2.sucursal_id = ${branch.id}
            and c2.activo = true
          group by c2.estado
        ) t
      ), '[]'::jsonb) as conteos
  `);

  const datos = sqlRows[0];
  const rows = (datos?.compras ?? []).map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
  }));
  const conteos = datos?.conteos ?? [];

  const conteoPorEstado = new Map(conteos.map((fila) => [fila.estado, Number(fila.total)]));
  const puedeEditar = hasPermission(context.access, "compras.editar");

  type Row = (typeof rows)[number];
  const columns: Array<DataTableColumn<Row>> = [
    {
      id: "fecha",
      header: "Fecha",
      cell: (row) => formatDate(row.fechaCompra ?? row.createdAt, { timeZone: context.timeZone }),
    },
    {
      id: "proveedor",
      header: "Proveedor",
      cell: (row) =>
        row.proveedorNombre ?? row.proveedorTexto ?? <span className="text-muted-foreground">Sin proveedor</span>,
    },
    {
      id: "folio",
      header: "Folio",
      cell: (row) => row.folio ?? <span className="text-muted-foreground">—</span>,
      hideBelow: "lg",
    },
    {
      id: "lineas",
      header: "Líneas",
      cell: (row) => <span className="tabular-nums">{row.numLineas}</span>,
      align: "right",
      hideBelow: "md",
    },
    {
      id: "total",
      header: "Total",
      cell: (row) => (
        <span className="tabular-nums">
          {formatCurrency(row.totalTicket ?? row.totalCalculado, { currency: context.currency })}
        </span>
      ),
      align: "right",
    },
    {
      id: "estado",
      header: "Estado",
      cell: (row) => {
        const info = COMPRA_ESTADO_INFO[row.estado as CompraEstado] ?? COMPRA_ESTADO_INFO.borrador;
        return <StatusBadge tone={info.tone}>{info.label}</StatusBadge>;
      },
    },
    {
      id: "recibida",
      header: "Recibió",
      cell: (row) => row.recibidaPor ?? <span className="text-muted-foreground">—</span>,
      hideBelow: "xl",
    },
    {
      id: "acciones",
      header: "",
      cell: (row) => (
        <Link
          className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
          data-action-id="compras.ver"
          href={buildAdminHref(`/compras/${row.id}`, { organizationId, sucursalId: branch.id })}
        >
          Ver
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
          puedeEditar ? (
            <Button
              data-action-clave="1"
              data-action-id="compras.nueva"
              nativeButton={false}
              render={<Link href={buildAdminHref("/compras/nueva", { organizationId, sucursalId: branch.id })} />}
              size="lg"
            >
              Nueva compra
            </Button>
          ) : null
        }
        description={`${branch.nombre} · tickets de proveedores y recepción de mercancía.`}
        title="Compras"
      />

      <div aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-2" role="group">
        <Link
          aria-current={!estadoValido ? "true" : undefined}
          className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 text-op-xs font-medium transition ${
            !estadoValido
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border text-muted-foreground hover:bg-muted/60"
          }`}
          data-action-id="compras.filtro.todas"
          href={buildAdminHref("/compras", { organizationId, sucursalId: branch.id, extra: { estado: null } })}
        >
          Todas · {conteos.reduce((acc, fila) => acc + Number(fila.total), 0)}
        </Link>
        {COMPRA_ESTADOS.map((estado) => (
          <Link
            aria-current={estadoValido === estado ? "true" : undefined}
            className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1.5 text-op-xs font-medium transition ${
              estadoValido === estado
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60"
            }`}
            data-action-id={`compras.filtro.${estado}`}
            href={buildAdminHref("/compras", { organizationId, sucursalId: branch.id, extra: { estado } })}
            key={estado}
          >
            {COMPRA_ESTADO_INFO[estado].label} · {conteoPorEstado.get(estado) ?? 0}
          </Link>
        ))}
      </div>

      <AdminCard className="overflow-hidden p-0 sm:p-0">
        {rows.length === 0 ? (
          <EmptyState
            className="border-0"
            description="Registra la primera compra con una foto del ticket del proveedor o capturándola a mano."
            icon={Truck}
            title={estadoValido ? "Sin compras en este estado" : "Sin compras registradas"}
          />
        ) : (
          <>
            <RegistroList>
              {rows.map((row) => {
                const info = COMPRA_ESTADO_INFO[row.estado as CompraEstado] ?? COMPRA_ESTADO_INFO.borrador;
                return (
                  <RegistroCard
                    acciones={
                      <Link
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
                        data-action-id="compras.ver"
                        href={buildAdminHref(`/compras/${row.id}`, { organizationId, sucursalId: branch.id })}
                      >
                        Ver compra
                      </Link>
                    }
                    badge={<StatusBadge tone={info.tone}>{info.label}</StatusBadge>}
                    campos={[
                      { label: "Fecha", value: formatDate(row.fechaCompra ?? row.createdAt, { timeZone: context.timeZone }) },
                      ...(row.folio ? [{ label: "Folio", value: row.folio }] : []),
                      { label: "Líneas", value: row.numLineas },
                      { label: "Total", value: formatCurrency(row.totalTicket ?? row.totalCalculado, { currency: context.currency }) },
                      ...(row.recibidaPor ? [{ label: "Recibió", value: row.recibidaPor }] : []),
                    ]}
                    className={row.estado === "con_observacion" ? "border-warning/50" : undefined}
                    key={row.id}
                    subtitulo={row.proveedorNombre ?? row.proveedorTexto ?? "Sin proveedor"}
                    titulo={`Compra ${row.folio ? `· ${row.folio}` : ""}`}
                  />
                );
              })}
            </RegistroList>
            <DataTable
              className="hidden md:block"
              columns={columns}
              emptyMessage="Sin compras en este estado."
              minWidth="880px"
              rowKey={(row) => row.id}
              rows={rows}
            />
          </>
        )}
      </AdminCard>
    </div>
  );
}
