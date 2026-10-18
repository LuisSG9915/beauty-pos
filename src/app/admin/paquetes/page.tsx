import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { togglePaquete } from "@/app/admin/paquetes/actions";
import { PaqueteForm } from "@/app/admin/paquetes/paquete-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, CATALOGO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function PaquetesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const estado = firstParam(params.estado) ?? "";
  const editId = firstParam(params.edit);

  const filtroBusqueda = query ? sql` and p.nombre ilike ${`%${query}%`}` : sql``;
  const filtroEstado =
    estado === "activo" ? sql` and p.activo = true` : estado === "oculto" ? sql` and p.activo = false` : sql``;

  type PaqueteJson = {
    id: string;
    clave: string;
    nombre: string;
    sesiones: number;
    precio: string;
    activo: boolean;
    servicioNombre: string;
    updatedAt: string;
  };
  type PaquetesSqlRow = {
    paquetes: PaqueteJson[];
    servicios: Array<{ id: string; nombre: string; duracionMinutos: number }>;
    editing: {
      id: string;
      organizacionId: string;
      clave: string;
      nombre: string;
      descripcion: string | null;
      servicioId: string;
      sesiones: number;
      precio: string;
      updatedAt: string;
    } | null;
  };

  // Listado + catálogo de servicios + fila en edición en UNA sola consulta SQL
  // (antes 2 consultas en `Promise.all` + 1 secuencial con `?edit=`). El
  // contexto de suscripción corre en la MISMA ronda vía React.cache.
  const [suscripcion, { rows }] = await Promise.all([
    contextoSuscripcion(organizationId),
    db.execute<PaquetesSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select
            p.id,
            p.clave,
            p.nombre,
            p.sesiones,
            p.precio::text as precio,
            p.activo,
            s.nombre as "servicioNombre",
            to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
          from paquetes p
          inner join servicios s on s.id = p.servicio_id
          where p.organizacion_id = ${organizationId}${filtroBusqueda}${filtroEstado}
          order by p.nombre asc
          limit 100
        ) t
      ), '[]'::jsonb) as paquetes,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'duracionMinutos', s.duracion_minutos) order by s.nombre)
        from servicios s
        where s.organizacion_id = ${organizationId} and s.activo = true
      ), '[]'::jsonb) as servicios,
      ${editId
        ? sql`(
            select jsonb_build_object(
              'id', p.id,
              'organizacionId', p.organizacion_id,
              'clave', p.clave,
              'nombre', p.nombre,
              'descripcion', p.descripcion,
              'servicioId', p.servicio_id,
              'sesiones', p.sesiones,
              'precio', p.precio::text,
              'updatedAt', to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
            from paquetes p
            where p.id = ${editId} and p.organizacion_id = ${organizationId}
            limit 1
          ) as editing`
        : sql`null as editing`}
    `),
  ]);

  if (!suscripcion.capacidades.has("paquetes")) {
    return (
      <PlanUpgradeNotice
        capacidad="paquetes"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }

  const datos = rows[0];
  const paqueteRows = datos?.paquetes ?? [];
  const serviciosItems = datos?.servicios ?? [];
  const editing = datos?.editing
    ? { ...datos.editing, updatedAt: new Date(datos.editing.updatedAt) }
    : undefined;
  const editingData = editing
    ? {
        id: editing.id,
        organizacionId: editing.organizacionId,
        clave: editing.clave,
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        servicioId: editing.servicioId,
        sesiones: editing.sesiones,
        precio: editing.precio,
      }
    : undefined;

  const hasFilters = Boolean(query || estado);
  const preserved = { q: query || null, estado: estado || null };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Paquetes prepagados: sesiones de un servicio que el cliente paga por adelantado."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={CATALOGO_TABS}
          />
        }
        title="Paquetes"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-52 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre del paquete" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="oculto">Ocultos</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
        {hasFilters ? (
          <Button nativeButton={false} render={<Link href={buildAdminHref("/paquetes", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.paquetes.nuevo"
            nativeButton={false}
            render={<Link href={buildAdminHref("/paquetes", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${paqueteRows.length} resultado(s)`}
        title="Paquetes registrados"
      >
        {paqueteRows.length === 0 ? (
          <EmptyState description="Crea un paquete de sesiones prepagadas para venderlo en el punto de venta." title="No hay paquetes" />
        ) : (
          <>
            <RegistroList>
              {paqueteRows.map((paquete) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" data-action-id="catalogo.paquetes.editar" href={buildAdminHref("/paquetes", { organizationId, extra: { ...preserved, edit: paquete.id } })}>Editar</Link>
                      <form action={togglePaquete}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={paquete.id} />
                        <input name="activo" type="hidden" value={String(paquete.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" data-action-id="catalogo.paquetes.toggle" type="submit">{paquete.activo ? "Ocultar" : "Activar"}</button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={paquete.activo} />}
                  campos={[
                    { label: "Servicio", value: paquete.servicioNombre },
                    { label: "Sesiones", value: paquete.sesiones },
                    { label: "Precio", value: formatCurrency(paquete.precio, { currency: context.currency }) },
                  ]}
                  key={paquete.id}
                  subtitulo={<span className="font-mono">{paquete.clave}</span>}
                  titulo={paquete.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Servicio</th>
                    <th className="py-2 pr-4 font-medium">Sesiones</th>
                    <th className="py-2 pr-4 font-medium">Precio</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paqueteRows.map((paquete) => (
                    <tr className="border-b border-border" key={paquete.id}>
                      <td className="py-3 pr-4 font-mono text-op-xs">{paquete.clave}</td>
                      <td className="py-3 pr-4 font-medium">{paquete.nombre}</td>
                      <td className="py-3 pr-4 text-op-xs text-muted-foreground">{paquete.servicioNombre}</td>
                      <td className="py-3 pr-4 tabular-nums">{paquete.sesiones}</td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(paquete.precio, { currency: context.currency })}</td>
                      <td className="py-3 pr-4"><StatusBadge active={paquete.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" data-action-id="catalogo.paquetes.editar" href={buildAdminHref("/paquetes", { organizationId, extra: { ...preserved, edit: paquete.id } })}>Editar</Link>
                          <form action={togglePaquete}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={paquete.id} />
                            <input name="activo" type="hidden" value={String(paquete.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" data-action-id="catalogo.paquetes.toggle" type="submit">{paquete.activo ? "Ocultar" : "Activar"}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/paquetes", { organizationId, extra: preserved })}
          description={editing ? "Ajusta los datos del paquete." : "Crea un paquete de sesiones prepagadas."}
          title={editing ? "Editar paquete" : "Nuevo paquete"}
        >
          <PaqueteForm
            initial={editingData}
            key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`}
            organizationId={organizationId}
            serviciosItems={serviciosItems}
          />
        </FormSheet>
      ) : null}
    </div>
  );
}
