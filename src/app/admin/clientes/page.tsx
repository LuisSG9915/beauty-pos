import { sql } from "drizzle-orm";
import { Download, Upload, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/app/admin/client-form";
import { ClientImport } from "@/app/admin/client-import";
import { ClientSheet } from "@/app/admin/clientes/client-sheet";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { AdminPageHeader } from "@/components/admin/page-header";
import { VistaAdaptativa } from "@/components/admin/vista-adaptativa";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { StatCard, StatCardGrid } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Promise<AdminSearchParams>;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "clientes.ver");
  const organizationId = context.organization.id;
  const puedeEditar = hasPermission(context.access, "clientes.editar");
  const puedeExportar = hasPermission(context.access, "clientes.exportar");
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const sortParam = firstParam(params.sort);
  const directionParam = firstParam(params.direction);
  const pagina = Math.max(1, Number.parseInt(firstParam(params.pagina) ?? "1", 10) || 1);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const editId = firstParam(params.edit);

  // Una sola ronda SQL: KPIs + conteo filtrado + página de clientes (con sus
  // enriquecimientos como subselects) + el cliente en edición cuando ?edit=
  // viene presente. Antes eran 4 consultas repartidas en 2 rondas; cada
  // consulta paralela abre una conexión fría al pool (~60 ms handshake +
  // ~100 ms RT).
  const filtroBusqueda = query
    ? sql` and (c.nombre ilike ${`%${query}%`} or c.apellido_paterno ilike ${`%${query}%`}
        or c.correo ilike ${`%${query}%`} or c.telefono ilike ${`%${query}%`})`
    : sql``;
  const ordenSql =
    sortParam === "createdAt"
      ? directionParam === "desc"
        ? sql`c.created_at desc`
        : sql`c.created_at asc`
      : directionParam === "desc"
        ? sql`c.nombre desc`
        : sql`c.nombre asc`;

  type ClienteListadoItem = {
    id: string;
    nombre: string;
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
    telefono: string | null;
    correo: string | null;
    activo: boolean;
    ultimaVisita: string | null;
    totalGastado: string | null;
    citasProximas: number;
  };
  type EditingClientJson = {
    id: string;
    organizacion_id: string;
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    telefono: string | null;
    correo: string | null;
    fecha_nacimiento: string | null;
    notas_operativas: string | null;
    rfc: string | null;
    razon_social: string | null;
    codigo_postal_fiscal: string | null;
    regimen_fiscal: string | null;
    uso_cfdi: string | null;
    activo: boolean;
    updated_at: string | null;
  };
  type ClientesRow = {
    stats: { total: number; conTelefono: number; conCorreo: number; nuevosMes: number } | null;
    totalFiltrado: number | null;
    clientes: ClienteListadoItem[];
    editingClient: EditingClientJson | null;
  };

  // Una sola ronda SQL: KPIs + página de clientes (con sus enriquecimientos
  // acotados a los 25 de la página) + el cliente en edición cuando ?edit=
  // viene presente. Los CTE `as materialized` fijan el orden de evaluación:
  // las agregaciones de citas/ventas corren solo sobre los clientes de la
  // página actual (antes el planner las evaluaba sobre todo el historial,
  // con un full scan del índice parcial de citas: 63ms de planning y 2× RUs).
  const result = await db.execute<ClientesRow>(sql`
    with pagina_clientes as materialized (
      select
        c.id,
        c.nombre,
        c.apellido_paterno as "apellidoPaterno",
        c.apellido_materno as "apellidoMaterno",
        c.telefono,
        c.correo,
        c.activo,
        row_number() over (order by ${ordenSql}) as rn
      from clientes c
      where c.organizacion_id = ${organizationId}${filtroBusqueda}
      order by ${ordenSql}
      limit ${PAGE_SIZE} offset ${(pagina - 1) * PAGE_SIZE}
    ),
    ci_agg as materialized (
      select
        ci.cliente_id,
        to_char(
          max(ci.fecha_hora) filter (
            where ci.estado not in ('cancelada', 'no_asistio') and ci.fecha_hora < now()
          ) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) as "ultimaVisita",
        count(*) filter (
          where ci.estado in ('pendiente', 'confirmada', 'en_proceso') and ci.fecha_hora >= now()
        )::int as "citasProximas"
      from pagina_clientes pc
      join citas ci on ci.cliente_id = pc.id
      where ci.organizacion_id = ${organizationId} and ci.activo
      group by ci.cliente_id
    ),
    v_agg as materialized (
      select
        v.cliente_id,
        sum(v.total + v.propina)::text as "totalGastado"
      from pagina_clientes pc
      join ventas v on v.organizacion_id = ${organizationId} and v.cliente_id = pc.id
      where v.activo and v.estado = 'completada'
      group by v.cliente_id
    )
    select
      (select jsonb_build_object(
          'total', count(*)::int,
          'conTelefono', count(*) filter (where telefono is not null and telefono <> '')::int,
          'conCorreo', count(*) filter (where correo is not null and correo <> '')::int,
          'nuevosMes', count(*) filter (where created_at >= ${inicioMes})::int)
        from clientes
       where organizacion_id = ${organizationId}) as stats,
      ${query
        ? sql`(select count(*)::int from clientes c
            where c.organizacion_id = ${organizationId}${filtroBusqueda}) as "totalFiltrado",`
        : sql`null::int as "totalFiltrado",`}
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', pc.id,
            'nombre', pc.nombre,
            'apellidoPaterno', pc."apellidoPaterno",
            'apellidoMaterno', pc."apellidoMaterno",
            'telefono', pc.telefono,
            'correo', pc.correo,
            'activo', pc.activo,
            'ultimaVisita', ci_agg."ultimaVisita",
            'totalGastado', v_agg."totalGastado",
            'citasProximas', coalesce(ci_agg."citasProximas", 0)
          )
          order by pc.rn
        )
        from pagina_clientes pc
        left join ci_agg on ci_agg.cliente_id = pc.id
        left join v_agg on v_agg.cliente_id = pc.id
      ), '[]'::jsonb) as clientes,
      ${editId
        ? sql`(select to_jsonb(c) from clientes c
            where c.id = ${editId} and c.organizacion_id = ${organizationId}) as "editingClient"`
        : sql`null as "editingClient"`}
  `);

  const data = result.rows[0];
  const kpi = data?.stats ?? { total: 0, conTelefono: 0, conCorreo: 0, nuevosMes: 0 };
  const totalFiltrado = Number(data?.totalFiltrado ?? kpi.total);
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const clientRows = data?.clientes ?? [];

  const editingClient = data?.editingClient
    ? {
        id: data.editingClient.id,
        organizacionId: data.editingClient.organizacion_id,
        nombre: data.editingClient.nombre,
        apellidoPaterno: data.editingClient.apellido_paterno,
        apellidoMaterno: data.editingClient.apellido_materno,
        telefono: data.editingClient.telefono,
        correo: data.editingClient.correo,
        fechaNacimiento: data.editingClient.fecha_nacimiento,
        notasOperativas: data.editingClient.notas_operativas,
        rfc: data.editingClient.rfc,
        razonSocial: data.editingClient.razon_social,
        codigoPostalFiscal: data.editingClient.codigo_postal_fiscal,
        regimenFiscal: data.editingClient.regimen_fiscal,
        usoCfdi: data.editingClient.uso_cfdi,
        updatedAt: data.editingClient.updated_at ? new Date(data.editingClient.updated_at) : null,
      }
    : undefined;
  const modoNuevo = firstParam(params.nuevo) === "1";
  const modoImportar = firstParam(params.importar) === "1";

  const hrefBase = (extra?: Record<string, string | null>) =>
    buildAdminHref("/clientes", {
      organizationId,
      extra: { q: query || null, sort: sortParam ?? null, direction: directionParam ?? null, ...extra },
    });
  const hrefCerrar = hrefBase({ nuevo: null, edit: null, importar: null, pagina: paginaActual > 1 ? String(paginaActual) : null });

  type ClientRow = (typeof clientRows)[number];
  const nombreCompletoDe = (client: ClientRow) =>
    [client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(" ");
  const columns: Array<DataTableColumn<ClientRow>> = [
    {
      id: "cliente",
      header: "Cliente",
      cell: (client) => (
        <Link
          className="inline-flex min-h-6 items-center font-medium hover:text-primary hover:underline"
          href={buildAdminHref(`/clientes/${client.id}`, { organizationId })}
          prefetch={false}
        >
          {nombreCompletoDe(client)}
        </Link>
      ),
    },
    {
      id: "telefono",
      header: "Teléfono",
      cell: (client) => <span className="text-muted-foreground">{client.telefono || "—"}</span>,
    },
    {
      id: "correo",
      header: "Correo",
      cell: (client) => <span className="block max-w-56 truncate text-muted-foreground">{client.correo || "—"}</span>,
      hideBelow: "lg",
    },
    {
      id: "ultimaVisita",
      header: "Última visita",
      cell: (client) =>
        client.ultimaVisita ? (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(client.ultimaVisita, { timeZone: context.timeZone })}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "totalGastado",
      header: "Total gastado",
      cell: (client) => <span className="tabular-nums">{formatCurrency(client.totalGastado, { currency: context.currency })}</span>,
      align: "right",
    },
    {
      id: "proximas",
      header: "Próximas citas",
      cell: (client) => <span className="tabular-nums">{client.citasProximas}</span>,
      align: "right",
      hideBelow: "lg",
    },
    { id: "estado", header: "Estado", cell: (client) => <StatusBadge active={client.activo} /> },
    ...(puedeEditar
      ? [
          {
            id: "acciones",
            header: "Acciones",
            cell: (client: ClientRow) => (
              <Link
                className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs font-medium text-primary hover:bg-muted/60"
                data-action-id="clientes.editar"
                href={hrefBase({ edit: client.id, pagina: String(paginaActual) })}
                prefetch={false}
              >
                Editar
              </Link>
            ),
            align: "right",
            stickyEnd: true,
          } satisfies DataTableColumn<ClientRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            {puedeExportar ? (
              // <a> nativo, no <Link>: una descarga no es navegación y nunca
              // debe prefetchearse — el handler registra auditoría por descarga.
              <Button
                data-action-id="clientes.exportar"
                nativeButton={false}
                render={<a download href={`/admin/clientes/export?organizationId=${organizationId}`} />}
                variant="outline"
              >
                <Download aria-hidden="true" />
                Exportar
              </Button>
            ) : null}
            {puedeEditar ? (
              <Button
                data-action-id="clientes.importar"
                nativeButton={false}
                render={<Link href={hrefBase({ importar: "1" })} prefetch={false} />}
                variant="outline"
              >
                <Upload aria-hidden="true" />
                Importar
              </Button>
            ) : null}
            {puedeEditar ? (
              <Button
                data-action-clave="1"
                data-action-id="clientes.nuevo"
                nativeButton={false}
                render={<Link href={hrefBase({ nuevo: "1" })} prefetch={false} />}
                size="lg"
              >
                <UserPlus aria-hidden="true" />
                Nuevo cliente
              </Button>
            ) : null}
          </>
        }
        description="Contactos, historial y expedientes de tu salón."
        title="Clientes"
      />

      <StatCardGrid>
        <StatCard icon={Users} label="Clientes registrados" value={kpi.total} />
        <StatCard hint="Altas desde el día 1" label="Nuevos este mes" value={kpi.nuevosMes} />
        <StatCard hint="Listos para confirmar citas" label="Con teléfono" value={kpi.conTelefono} />
        <StatCard hint="A quienes puedes escribir" label="Con correo" value={kpi.conCorreo} />
      </StatCardGrid>

      <form className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 w-full min-w-0" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel htmlFor="buscar-clientes">Buscar</FieldLabel>
          <Input id="buscar-clientes" defaultValue={query} key={query} name="q" placeholder="Nombre, teléfono o correo" />
        </Field>
        <div className="flex items-center gap-2">
          <Button className="min-h-11" type="submit" variant="secondary">Buscar</Button>
          {query ? (
            <Button className="min-h-11" nativeButton={false} render={<Link href={hrefBase({ pagina: null })} prefetch={false} />} variant="ghost">
              Limpiar
            </Button>
          ) : null}
        </div>
        {/* Ordenación plegada: ajuste secundario, no parte del flujo diario. */}
        <details className="w-full">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
            Cambiar el orden de la lista
          </summary>
          <div className="mt-3 grid grid-cols-1 max-w-md gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Orden</FieldLabel>
              <Select defaultValue={sortParam ?? "nombre"} key={sortParam ?? "nombre"} name="sort">
                <option value="nombre">Por nombre</option>
                <option value="createdAt">Más recientes</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Dirección</FieldLabel>
              <Select defaultValue={directionParam ?? "asc"} key={directionParam ?? "asc"} name="direction">
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </Select>
            </Field>
          </div>
        </details>
      </form>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {clientRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              action={puedeEditar ? (
                <Button
                  data-action-id="clientes.nuevo"
                  nativeButton={false}
                  render={<Link href={hrefBase({ nuevo: "1" })} prefetch={false} />}
                  size="lg"
                >
                  <UserPlus aria-hidden="true" />
                  Nuevo cliente
                </Button>
              ) : undefined}
              description={query ? "Ningún cliente coincide con la búsqueda." : "Registra tu primer cliente para agendar y cobrar más rápido."}
              icon={Users}
              title={query ? "Sin resultados" : "No hay clientes"}
            />
          </div>
        ) : (
          <VistaAdaptativa>
            <RegistroList className="p-3 md:hidden">
              {clientRows.map((client) => (
                <RegistroCard
                  acciones={puedeEditar ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-op-xs text-muted-foreground hover:bg-muted/60"
                      data-action-id="clientes.editar"
                      href={hrefBase({ edit: client.id, pagina: String(paginaActual) })}
                      prefetch={false}
                    >
                      Editar
                    </Link>
                  ) : undefined}
                  badge={<StatusBadge active={client.activo} />}
                  campos={[
                    { label: "Teléfono", value: client.telefono || "—" },
                    { label: "Correo", value: <span className="break-all">{client.correo || "—"}</span> },
                    ...(client.ultimaVisita
                      ? [{ label: "Última visita", value: formatDate(client.ultimaVisita, { timeZone: context.timeZone }) }]
                      : []),
                    ...(client.totalGastado !== null
                      ? [{ label: "Total gastado", value: formatCurrency(client.totalGastado, { currency: context.currency }) }]
                      : []),
                    { label: "Próximas citas", value: String(client.citasProximas) },
                  ]}
                  key={client.id}
                  titulo={
                    <Link
                      className="inline-flex min-h-11 items-center hover:text-primary hover:underline font-medium"
                      href={buildAdminHref(`/clientes/${client.id}`, { organizationId })}
                      prefetch={false}
                    >
                      {nombreCompletoDe(client)}
                    </Link>
                  }
                />
              ))}
            </RegistroList>
            <DataTable
              className="hidden md:block"
              columns={columns}
              minWidth="880px"
              rowKey={(client) => client.id}
              rows={clientRows}
            />
          </VistaAdaptativa>
        )}
        {totalPaginas > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              Página {paginaActual} de {totalPaginas} · {totalFiltrado} cliente(s)
            </span>
            <div className="flex items-center gap-2">
              {paginaActual > 1 ? (
                <Button className="min-h-11" nativeButton={false} render={<Link href={hrefBase({ pagina: String(paginaActual - 1) })} prefetch={false} />} size="sm" variant="outline">
                  Anterior
                </Button>
              ) : null}
              {paginaActual < totalPaginas ? (
                <Button className="min-h-11" nativeButton={false} render={<Link href={hrefBase({ pagina: String(paginaActual + 1) })} prefetch={false} />} size="sm" variant="outline">
                  Siguiente
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* Alta, edición e importación comparten el mismo panel lateral; el modo
          activo lo define la URL para que sea enlazable y sobreviva SSR. Solo
          se montan cuando están abiertos para ahorrar SSR e hidratación. */}
      {modoNuevo || Boolean(editingClient) ? (
        <ClientSheet
          closeHref={hrefCerrar}
          description="Solo el nombre es obligatorio; el teléfono ayuda a confirmar citas."
          key={`${modoNuevo}-${editingClient?.id ?? ""}-${editingClient?.updatedAt?.getTime() ?? ""}`}
          open
          title={editingClient ? "Editar cliente" : "Nuevo cliente"}
        >
          <ClientForm initial={editingClient} organizationId={organizationId} />
        </ClientSheet>
      ) : null}
      {modoImportar ? (
        <ClientSheet
          closeHref={hrefCerrar}
          description="Carga un CSV guardado desde Excel con tus clientes."
          key="importar"
          open
          title="Importar clientes"
        >
          <ClientImport organizationId={organizationId} />
        </ClientSheet>
      ) : null}
    </div>
  );
}
