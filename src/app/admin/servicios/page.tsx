import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleService } from "@/app/admin/servicios/actions";
import { ComisionesManager } from "@/app/admin/servicios/comisiones-manager";
import { InsumosManager } from "@/app/admin/servicios/insumos-manager";
import { ServiceForm } from "@/app/admin/servicios/service-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, CATALOGO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { ToggleActivo } from "@/components/admin/toggle-activo";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function ServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const editId = firstParam(params.edit);
  const filtroBusqueda = query ? sql` and s.nombre ilike ${`%${query}%`}` : sql``;

  type ServiceRowItem = {
    id: string;
    clave: string;
    nombre: string;
    categoriaNombre: string | null;
    duracionMinutos: number;
    precioBase: string;
    activo: boolean;
    vecesVendido: number;
  };
  type EditingServiceRow = {
    id: string;
    organizacionId: string;
    categoriaId: string | null;
    clave: string;
    nombre: string;
    descripcion: string | null;
    duracionMinutos: number;
    precioBase: string;
    visibleAgenda: boolean;
    requiereCabina: boolean;
    imagenClaveR2: string | null;
    updatedAt: string | null;
  };
  type ServiciosSqlRow = {
    categories: Array<{ id: string; nombre: string }>;
    servicios: ServiceRowItem[];
    roles: Array<{ id: string; nombre: string }>;
    editing: EditingServiceRow | null;
    insumos_data: Array<{
      id: string;
      productoId: string;
      productoNombre: string;
      productoSku: string;
      cantidad: string;
      unidadNombre: string | null;
    }>;
    insumos_disponibles: Array<{
      id: string;
      sku: string;
      nombre: string;
      unidadNombre: string | null;
    }>;
    comisiones_data: Array<{
      id: string;
      tipo: string;
      valor: string;
      rolNombre: string | null;
    }>;
  };

  // Toda la pantalla (incluyendo edición con insumos y comisiones cuando viene
  // ?edit=) en UNA sola ronda SQL con CTEs materializados (antes hasta 7
  // consultas repartidas en 3 rondas secuenciales).
  const { rows } = await db.execute<ServiciosSqlRow>(sql`
    with servicios_pagina as materialized (
      select
        s.id,
        s.clave,
        s.nombre,
        cs.nombre as "categoriaNombre",
        s.duracion_minutos as "duracionMinutos",
        s.precio_base::text as "precioBase",
        s.activo,
        s.created_at
      from servicios s
      left join cat_categorias_servicios cs on cs.id = s.categoria_id
      where s.organizacion_id = ${organizationId}${filtroBusqueda}
      order by s.created_at desc
      limit 100
    ),
    vendidos_30d as materialized (
      select
        dvs.servicio_id,
        coalesce(sum(dvs.cantidad), 0)::int as veces
      from servicios_pagina sp
      join detalle_ventas_servicios dvs on dvs.servicio_id = sp.id and dvs.activo
      join ventas v on v.id = dvs.venta_id
      where v.organizacion_id = ${organizationId}
        and v.activo
        and v.estado = 'completada'
        and coalesce(v.cobrada_at, v.created_at) >= now() - interval '30 days'
      group by dvs.servicio_id
    )
    select
      coalesce((
        select jsonb_agg(t) from (
          select cs.id, cs.nombre
          from cat_categorias_servicios cs
          where cs.organizacion_id = ${organizationId} and cs.activo = true
          order by cs.nombre asc
        ) t
      ), '[]'::jsonb) as categories,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'clave', sp.clave,
            'nombre', sp.nombre,
            'categoriaNombre', sp."categoriaNombre",
            'duracionMinutos', sp."duracionMinutos",
            'precioBase', sp."precioBase",
            'activo', sp.activo,
            'vecesVendido', coalesce(v30.veces, 0)
          )
          order by sp.created_at desc
        )
        from servicios_pagina sp
        left join vendidos_30d v30 on v30.servicio_id = sp.id
      ), '[]'::jsonb) as servicios,
      coalesce((
        select jsonb_agg(t) from (
          select r.id, r.nombre
          from cat_roles r
          where r.organizacion_id = ${organizationId} and r.activo = true
          order by r.nombre asc
        ) t
      ), '[]'::jsonb) as roles,
      ${editId
        ? sql`(
            select jsonb_build_object(
              'id', s.id,
              'organizacionId', s.organizacion_id,
              'categoriaId', s.categoria_id,
              'clave', s.clave,
              'nombre', s.nombre,
              'descripcion', s.descripcion,
              'duracionMinutos', s.duracion_minutos,
              'precioBase', s.precio_base::text,
              'visibleAgenda', s.visible_agenda,
              'requiereCabina', s.requiere_cabina,
              'imagenClaveR2', m.clave_r2,
              'updatedAt', to_char(s.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
            from servicios s
            left join medios m on m.id = s.imagen_principal_id
            where s.id = ${editId} and s.organizacion_id = ${organizationId}
            limit 1
          ) as editing,
          coalesce((
            select jsonb_agg(t) from (
              select
                rsi.id,
                rsi.producto_id as "productoId",
                p.nombre as "productoNombre",
                p.sku as "productoSku",
                rsi.cantidad::text as cantidad,
                um.nombre as "unidadNombre"
              from rel_servicios_insumos rsi
              join productos p on p.id = rsi.producto_id
              left join cat_unidades_medida um on um.id = p.unidad_medida_id
              where rsi.servicio_id = ${editId}
                and rsi.organizacion_id = ${organizationId}
                and rsi.activo = true
            ) t
          ), '[]'::jsonb) as insumos_data,
          coalesce((
            select jsonb_agg(t) from (
              select
                p.id,
                p.sku,
                p.nombre,
                um.nombre as "unidadNombre"
              from productos p
              left join cat_unidades_medida um on um.id = p.unidad_medida_id
              where p.organizacion_id = ${organizationId}
                and p.activo = true
                and p.tipo in ('insumo', 'ambos')
              order by p.nombre asc
            ) t
          ), '[]'::jsonb) as insumos_disponibles,
          coalesce((
            select jsonb_agg(t) from (
              select
                c.id,
                c.tipo,
                c.valor::text as valor,
                r.nombre as "rolNombre"
              from comisiones c
              left join cat_roles r on r.id = c.rol_id
              where c.servicio_id = ${editId}
                and c.organizacion_id = ${organizationId}
                and c.activo = true
            ) t
          ), '[]'::jsonb) as comisiones_data`
        : sql`null as editing, '[]'::jsonb as insumos_data, '[]'::jsonb as insumos_disponibles, '[]'::jsonb as comisiones_data`}
  `);

  const datos = rows[0];
  const categories = datos?.categories ?? [];
  const serviceRows = datos?.servicios ?? [];
  const roles = datos?.roles ?? [];
  const editing = datos?.editing
    ? {
        ...datos.editing,
        updatedAt: datos.editing.updatedAt ? new Date(datos.editing.updatedAt) : null,
      }
    : undefined;
  const insumosData = datos?.insumos_data ?? [];
  const insumosDisponibles = datos?.insumos_disponibles ?? [];
  const comisionesData = datos?.comisiones_data ?? [];

  type ServiceRow = (typeof serviceRows)[number];
  const columns: Array<DataTableColumn<ServiceRow>> = [
    {
      id: "clave",
      header: "Clave",
      cell: (service) => <span className="font-mono text-op-xs">{service.clave}</span>,
    },
    { id: "nombre", header: "Nombre", cell: (service) => <span className="font-medium">{service.nombre}</span> },
    {
      id: "categoria",
      header: "Categoría",
      cell: (service) => service.categoriaNombre ?? <span className="text-muted-foreground">—</span>,
      hideBelow: "xl",
    },
    {
      id: "duracion",
      header: "Duración",
      cell: (service) => <span className="text-muted-foreground">{service.duracionMinutos} min</span>,
    },
    {
      id: "precio",
      header: "Precio",
      cell: (service) => <span className="tabular-nums">{formatCurrency(service.precioBase, { currency: context.currency })}</span>,
      align: "right",
    },
    {
      id: "vendidos",
      header: "Vendidos (30 días)",
      cell: (service) => <span className="tabular-nums">{service.vecesVendido}</span>,
      align: "right",
      hideBelow: "lg",
    },
    { id: "estado", header: "Estado", cell: (service) => <StatusBadge active={service.activo} /> },
    {
      id: "acciones",
      header: "Acciones",
      cell: (service) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
            data-action-id="catalogo.servicios.editar"
            href={buildAdminHref("/servicios", { organizationId, extra: { edit: service.id, q: query || null } })}
          >
            Editar
          </Link>
          <ToggleActivo
            action={toggleService}
            activo={service.activo}
            confirmHint="Dejará de aparecer en la agenda y en el punto de venta."
            entidad="servicio"
            id={service.id}
            nombre={service.nombre}
            organizationId={organizationId}
            telemetryBase="catalogo.servicios"
          />
        </div>
      ),
      align: "right",
      stickyEnd: true,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-servicios", { organizationId })} />} variant="outline">
            Categorías de servicios
          </Button>
        }
        description="Catálogo de servicios, insumos y comisiones."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={CATALOGO_TABS}
          />
        }
        title="Servicios"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre del servicio" />
        </Field>
        <Button className="rounded-xl" type="submit">Buscar</Button>
      </form>

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.servicios.nuevo"
            nativeButton={false}
            render={<Link href={buildAdminHref("/servicios", { organizationId, extra: { nuevo: "1", q: query || null } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${serviceRows.length} resultado(s)`}
        title="Servicios registrados"
      >
        {serviceRows.length === 0 ? (
          <EmptyState description="Crea servicios para el salón: cortes, tratamientos, manicure, etc." title="No hay servicios" />
        ) : (
          <>
            <RegistroList>
              {serviceRows.map((service) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
                        data-action-id="catalogo.servicios.editar"
                        href={buildAdminHref("/servicios", { organizationId, extra: { edit: service.id, q: query || null } })}
                      >
                        Editar
                      </Link>
                      <ToggleActivo
                        action={toggleService}
                        activo={service.activo}
                        confirmHint="Dejará de aparecer en la agenda y en el punto de venta."
                        entidad="servicio"
                        id={service.id}
                        nombre={service.nombre}
                        organizationId={organizationId}
                        telemetryBase="catalogo.servicios"
                      />
                    </div>
                  }
                  badge={<StatusBadge active={service.activo} />}
                  campos={[
                    ...(service.categoriaNombre ? [{ label: "Categoría", value: service.categoriaNombre }] : []),
                    { label: "Duración", value: `${service.duracionMinutos} min` },
                    { label: "Precio", value: formatCurrency(service.precioBase, { currency: context.currency }) },
                    { label: "Vendidos (30 días)", value: String(service.vecesVendido) },
                  ]}
                  key={service.id}
                  subtitulo={<span className="font-mono">{service.clave}</span>}
                  titulo={service.nombre}
                />
              ))}
            </RegistroList>
            <DataTable
              className="hidden md:block"
              columns={columns}
              minWidth="760px"
              rowKey={(service) => service.id}
              rows={serviceRows}
            />
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/servicios", { organizationId, extra: { q: query || null } })}
          description={editing ? "Ajusta datos, insumos y comisiones del servicio." : "Crea un servicio para agendarlo y cobrarlo."}
          title={editing ? "Editar servicio" : "Nuevo servicio"}
          wide
        >
          <ServiceForm categories={categories} initial={editing} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
          {editing ? (
            <InsumosManager disponibles={insumosDisponibles} insumos={insumosData} organizationId={organizationId} servicioId={editing.id} />
          ) : null}
          {editing ? (
            <ComisionesManager comisiones={comisionesData} organizationId={organizationId} roles={roles} servicioId={editing.id} />
          ) : null}
        </FormSheet>
      ) : null}
    </div>
  );
}
