import { and, asc, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
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
import { catRoles } from "@/db/schema/access";
import {
  catCategoriasServicios,
  catUnidadesMedida,
  comisiones,
  productos,
  relServiciosInsumos,
  servicios,
} from "@/db/schema/catalogs";
import { medios } from "@/db/schema/media";
import { detalleVentasServicios, ventas } from "@/db/schema/operations";
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
  const filters = [eq(servicios.organizacionId, organizationId)];
  if (query) filters.push(ilike(servicios.nombre, `%${query}%`));

  const [categories, serviceRows, roles] = await Promise.all([
    db
      .select({ id: catCategoriasServicios.id, nombre: catCategoriasServicios.nombre })
      .from(catCategoriasServicios)
      .where(and(eq(catCategoriasServicios.organizacionId, organizationId), eq(catCategoriasServicios.activo, true)))
      .orderBy(asc(catCategoriasServicios.nombre)),
    db
      .select({
        id: servicios.id,
        clave: servicios.clave,
        nombre: servicios.nombre,
        categoriaNombre: catCategoriasServicios.nombre,
        duracionMinutos: servicios.duracionMinutos,
        precioBase: servicios.precioBase,
        activo: servicios.activo,
        // Veces vendido en los últimos 30 días (líneas de servicio de ventas
        // completadas) como subselect escalar: mismo round-trip, sin N+1.
        vecesVendido: sql<number>`(
          select coalesce(sum(${detalleVentasServicios.cantidad}), 0)::int
            from ${detalleVentasServicios}
            join ${ventas} on ${ventas.id} = ${detalleVentasServicios.ventaId}
           where ${detalleVentasServicios.servicioId} = ${servicios.id}
             and ${detalleVentasServicios.activo}
             and ${ventas.activo}
             and ${ventas.estado} = 'completada'
             and ${ventas.organizacionId} = ${organizationId}
             and coalesce(${ventas.cobradaAt}, ${ventas.createdAt}) >= now() - interval '30 days'
        )`,
      })
      .from(servicios)
      .leftJoin(catCategoriasServicios, eq(servicios.categoriaId, catCategoriasServicios.id))
      .where(and(...filters))
      .orderBy(desc(servicios.createdAt))
      .limit(100),
    db
      .select({ id: catRoles.id, nombre: catRoles.nombre })
      .from(catRoles)
      .where(and(eq(catRoles.organizacionId, organizationId), eq(catRoles.activo, true)))
      .orderBy(asc(catRoles.nombre)),
  ]);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db
        .select({ ...getTableColumns(servicios), imagenClaveR2: medios.claveR2 })
        .from(servicios)
        .leftJoin(medios, eq(servicios.imagenPrincipalId, medios.id))
        .where(and(eq(servicios.id, editId), eq(servicios.organizacionId, organizationId)))
        .limit(1))[0]
    : undefined;

  let insumosData: Array<{ id: string; productoId: string; productoNombre: string; productoSku: string; cantidad: string; unidadNombre: string | null }> = [];
  let insumosDisponibles: Array<{ id: string; sku: string; nombre: string; unidadNombre: string | null }> = [];
  let comisionesData: Array<{ id: string; tipo: string; valor: string; rolNombre: string | null }> = [];

  if (editing) {
    [insumosData, insumosDisponibles, comisionesData] = await Promise.all([
      db
        .select({
          id: relServiciosInsumos.id,
          productoId: relServiciosInsumos.productoId,
          productoNombre: productos.nombre,
          productoSku: productos.sku,
          cantidad: relServiciosInsumos.cantidad,
          unidadNombre: catUnidadesMedida.nombre,
        })
        .from(relServiciosInsumos)
        .innerJoin(productos, eq(relServiciosInsumos.productoId, productos.id))
        .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
        .where(and(eq(relServiciosInsumos.servicioId, editing.id), eq(relServiciosInsumos.activo, true))),
      db
        .select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, unidadNombre: catUnidadesMedida.nombre })
        .from(productos)
        .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
        .where(and(eq(productos.organizacionId, organizationId), eq(productos.activo, true), or(eq(productos.tipo, "insumo"), eq(productos.tipo, "ambos"))))
        .orderBy(asc(productos.nombre)),
      db
        .select({ id: comisiones.id, tipo: comisiones.tipo, valor: comisiones.valor, rolNombre: catRoles.nombre })
        .from(comisiones)
        .leftJoin(catRoles, eq(comisiones.rolId, catRoles.id))
        .where(and(eq(comisiones.servicioId, editing.id), eq(comisiones.activo, true))),
    ]);
  }

  type ServiceRow = (typeof serviceRows)[number];
  const columns: Array<DataTableColumn<ServiceRow>> = [
    {
      id: "clave",
      header: "Clave",
      cell: (service) => <span className="font-mono text-xs">{service.clave}</span>,
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
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
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
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
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
