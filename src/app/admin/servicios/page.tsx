import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleService } from "@/app/admin/servicios/actions";
import { ComisionesManager } from "@/app/admin/servicios/comisiones-manager";
import { InsumosManager } from "@/app/admin/servicios/insumos-manager";
import { ServiceForm } from "@/app/admin/servicios/service-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
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
        duracionMinutos: servicios.duracionMinutos,
        precioBase: servicios.precioBase,
        activo: servicios.activo,
      })
      .from(servicios)
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
    ? (await db.select().from(servicios).where(and(eq(servicios.id, editId), eq(servicios.organizacionId, organizationId))).limit(1))[0]
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-servicios", { organizationId })} />} variant="outline">
            Categorías de servicios
          </Button>
        }
        description="Catálogo de servicios, insumos y comisiones."
        title="Servicios"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-56 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre del servicio" />
        </Field>
        <Button className="rounded-xl" type="submit">Buscar</Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <ServiceForm categories={categories} initial={editing} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
          {editing ? (
            <InsumosManager disponibles={insumosDisponibles} insumos={insumosData} organizationId={organizationId} servicioId={editing.id} />
          ) : null}
          {editing ? (
            <ComisionesManager comisiones={comisionesData} organizationId={organizationId} roles={roles} servicioId={editing.id} />
          ) : null}
        </div>

        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/servicios", { organizationId })} />}>
              Nuevo
            </Button>
          }
          className="self-start"
          description={`${serviceRows.length} resultado(s)`}
          title="Servicios registrados"
        >
          {serviceRows.length === 0 ? (
            <EmptyState description="Crea servicios para el salón: cortes, tratamientos, manicure, etc." title="No hay servicios" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Duración</th>
                    <th className="py-2 pr-4 font-medium">Precio</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRows.map((service) => (
                    <tr className="border-b border-border" key={service.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{service.clave}</td>
                      <td className="py-3 pr-4 font-medium">{service.nombre}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{service.duracionMinutos} min</td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(service.precioBase, { currency: context.currency })}</td>
                      <td className="py-3 pr-4"><StatusBadge active={service.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
                            href={buildAdminHref("/servicios", { organizationId, extra: { edit: service.id, q: query || null } })}
                          >
                            Editar
                          </Link>
                          <form action={toggleService}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={service.id} />
                            <input name="activo" type="hidden" value={String(service.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">
                              {service.activo ? "Ocultar" : "Activar"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
