import { sql } from "drizzle-orm";
import { Download, Upload, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { StatCard, StatCardGrid } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { firstParam } from "@/lib/url-context";
import { leerViewportPreference } from "@/lib/viewport-preference";
import { ClientesList } from "./clientes-list";

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

  const viewport = await leerViewportPreference();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            {puedeExportar ? (
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
                render={<Link href={`/admin/clientes?organizationId=${organizationId}&importar=1`} prefetch={false} />}
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
                render={<Link href={`/admin/clientes?organizationId=${organizationId}&nuevo=1`} prefetch={false} />}
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

      <form className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-2 w-full min-w-0" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel htmlFor="buscar-clientes">Buscar</FieldLabel>
          <Input id="buscar-clientes" defaultValue={query} key={query} name="q" placeholder="Nombre, teléfono o correo" />
        </Field>
        <div className="flex items-center gap-2">
          <Button className="min-h-11" type="submit" variant="secondary">Buscar</Button>
          {query ? (
            <Button className="min-h-11" nativeButton={false} render={<Link href={`/admin/clientes?organizationId=${organizationId}`} prefetch={false} />} variant="ghost">
              Limpiar
            </Button>
          ) : null}
        </div>
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

      <ClientesList
        rows={clientRows}
        organizationId={organizationId}
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        totalFiltrado={totalFiltrado}
        puedeEditar={puedeEditar}
        timeZone={context.timeZone}
        currency={context.currency}
        query={query}
        modoNuevo={modoNuevo}
        editingClient={editingClient}
        modoImportar={modoImportar}
        viewport={viewport}
      />
    </div>
  );
}