import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";
import { formatDate, formatTime } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const PAGE_SIZE = 50;

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "auditoria.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const desde = firstParam(params.desde) ?? "";
  const hasta = firstParam(params.hasta) ?? "";
  const accion = firstParam(params.accion) ?? "";
  const usuarioId = firstParam(params.usuarioId) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? "1") || 1);

  const filtroDesde = desde ? sql` and ae.created_at >= ${new Date(`${desde}T00:00:00`)}` : sql``;
  const filtroHasta = hasta ? sql` and ae.created_at < ${new Date(`${hasta}T23:59:59.999`)}` : sql``;
  const filtroAccion = accion ? sql` and ae.accion = ${accion}` : sql``;
  const filtroUsuario = usuarioId ? sql` and ae.usuario_id = ${usuarioId}` : sql``;

  type EventoJson = {
    id: string;
    accion: string;
    entidad: string | null;
    entidadId: string | null;
    detalle: unknown;
    createdAt: string;
    usuario: string | null;
    sucursal: string | null;
  };
  type AuditoriaSqlRow = {
    eventos: EventoJson[];
    usuarios: Array<{ id: string; nombre: string }>;
    acciones: Array<{ accion: string }>;
  };

  // Eventos paginados + usuarios con actividad + acciones registradas en UNA
  // sola consulta SQL (antes 3 consultas en `Promise.all`). El contexto de
  // suscripción corre en la MISMA ronda: comparte la promesa en vuelo de
  // `AdminLayout` (React.cache), así la página paga 2 rondas y no 3.
  const [suscripcion, { rows: sqlRows }] = await Promise.all([
    contextoSuscripcion(organizationId),
    db.execute<AuditoriaSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select
            ae.id,
            ae.accion,
            ae.entidad,
            ae.entidad_id as "entidadId",
            ae.detalle,
            to_char(ae.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            u.nombre as usuario,
            s.nombre as sucursal
          from auditoria_eventos ae
          left join usuarios u on u.id = ae.usuario_id
          left join sucursales s on s.id = ae.sucursal_id
          where ae.organizacion_id = ${organizationId}${filtroDesde}${filtroHasta}${filtroAccion}${filtroUsuario}
          order by ae.created_at desc
          limit ${PAGE_SIZE + 1} offset ${(page - 1) * PAGE_SIZE}
        ) t
      ), '[]'::jsonb) as eventos,
      coalesce((
        select jsonb_agg(t) from (
          select u.id, u.nombre
          from usuarios u
          join auditoria_eventos ae2 on ae2.usuario_id = u.id
          where ae2.organizacion_id = ${organizationId}
          group by u.id, u.nombre
          order by u.nombre asc
        ) t
      ), '[]'::jsonb) as usuarios,
      coalesce((
        select jsonb_agg(jsonb_build_object('accion', accion) order by accion)
        from (
          select distinct ae3.accion
          from auditoria_eventos ae3
          where ae3.organizacion_id = ${organizationId}
        ) t
      ), '[]'::jsonb) as acciones
    `),
  ]);

  if (!suscripcion.capacidades.has("auditoria")) {
    return (
      <PlanUpgradeNotice
        capacidad="auditoria"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }

  const datos = sqlRows[0];
  const eventos = (datos?.eventos ?? []).map((e) => ({ ...e, createdAt: new Date(e.createdAt) }));
  const usuariosRows = datos?.usuarios ?? [];
  const accionesRows = datos?.acciones ?? [];

  const hasMore = eventos.length > PAGE_SIZE;
  const pageRows = eventos.slice(0, PAGE_SIZE);
  const baseParams = { organizationId, extra: { desde, hasta, accion, usuarioId } };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Bitácora de eventos sensibles: quién hizo qué, dónde y cuándo."
        title="Auditoría"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Field className="w-52">
          <FieldLabel>Acción</FieldLabel>
          <Select defaultValue={accion} name="accion">
            <option value="">Todas</option>
            {accionesRows.map((row) => (
              <option key={row.accion} value={row.accion}>{row.accion}</option>
            ))}
          </Select>
        </Field>
        <Field className="w-52">
          <FieldLabel>Usuario</FieldLabel>
          <Select defaultValue={usuarioId} name="usuarioId">
            <option value="">Todos</option>
            {usuariosRows.map((row) => (
              <option key={row.id} value={row.id}>{row.nombre}</option>
            ))}
          </Select>
        </Field>
        <Button className="rounded-xl" data-action-clave="1" data-action-id="auditoria.filtro.aplicar" size="lg" type="submit">Filtrar</Button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState description="No hay eventos registrados con esos filtros." title="Sin eventos" />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {pageRows.map((evento, index) => (
              <article className="anim-entrada rounded-xl border border-border bg-card p-4 shadow-sm" key={evento.id} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-5 text-foreground">{evento.usuario ?? "Sistema"}</h3>
                    <p className="mt-0.5 text-op-xs leading-5 text-muted-foreground">
                      {formatDate(evento.createdAt)} · {formatTime(evento.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted/60 px-2.5 py-1 text-op-xs font-medium text-primary">
                    {evento.accion}
                  </span>
                </div>
                <dl className="mt-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-op-xs text-muted-foreground">Sucursal</dt>
                    <dd className="min-w-0 text-right font-medium text-foreground">{evento.sucursal ?? "—"}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-op-xs text-muted-foreground">Detalle</dt>
                    <dd className="min-w-0 truncate text-right text-op-xs text-muted-foreground" title={evento.detalle ? JSON.stringify(evento.detalle) : undefined}>
                      {evento.detalle ? JSON.stringify(evento.detalle) : evento.entidad ? `${evento.entidad} ${evento.entidadId ?? ""}` : "—"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-op-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Sucursal</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((evento) => (
                <tr className="border-b border-border last:border-0" key={evento.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(evento.createdAt)} <span className="text-muted-foreground">{formatTime(evento.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{evento.usuario ?? "Sistema"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-op-xs font-medium text-primary">
                      {evento.accion}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{evento.sucursal ?? "—"}</td>
                  <td className="hidden max-w-72 px-4 py-3 lg:table-cell">
                    <span className="block truncate text-op-xs text-muted-foreground" title={evento.detalle ? JSON.stringify(evento.detalle) : undefined}>
                      {evento.detalle ? JSON.stringify(evento.detalle) : evento.entidad ? `${evento.entidad} ${evento.entidadId ?? ""}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/auditoria", { ...baseParams, extra: { ...baseParams.extra, page: String(page - 1) } })} />} variant="outline">
              ← Anterior
            </Button>
          ) : null}
          {hasMore ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/auditoria", { ...baseParams, extra: { ...baseParams.extra, page: String(page + 1) } })} />} variant="outline">
              Siguiente →
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
