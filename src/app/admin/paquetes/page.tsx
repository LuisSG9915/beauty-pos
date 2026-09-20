import { and, asc, eq, ilike } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { togglePaquete } from "@/app/admin/paquetes/actions";
import { PaqueteForm } from "@/app/admin/paquetes/paquete-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { paquetes, servicios } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { contextoSuscripcion } from "@/modules/billing/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function PaquetesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const suscripcion = await contextoSuscripcion(organizationId);
  if (!suscripcion.capacidades.has("paquetes")) {
    return (
      <PlanUpgradeNotice
        capacidad="paquetes"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const estado = firstParam(params.estado) ?? "";

  const filters = [eq(paquetes.organizacionId, organizationId)];
  if (query) filters.push(ilike(paquetes.nombre, `%${query}%`));
  if (estado === "activo") filters.push(eq(paquetes.activo, true));
  if (estado === "oculto") filters.push(eq(paquetes.activo, false));

  const [paqueteRows, serviciosItems] = await Promise.all([
    db
      .select({
        id: paquetes.id,
        clave: paquetes.clave,
        nombre: paquetes.nombre,
        sesiones: paquetes.sesiones,
        precio: paquetes.precio,
        activo: paquetes.activo,
        servicioNombre: servicios.nombre,
      })
      .from(paquetes)
      .innerJoin(servicios, eq(paquetes.servicioId, servicios.id))
      .where(and(...filters))
      .orderBy(asc(paquetes.nombre))
      .limit(100),
    db
      .select({ id: servicios.id, nombre: servicios.nombre, duracionMinutos: servicios.duracionMinutos })
      .from(servicios)
      .where(and(eq(servicios.organizacionId, organizationId), eq(servicios.activo, true)))
      .orderBy(asc(servicios.nombre)),
  ]);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select().from(paquetes).where(and(eq(paquetes.id, editId), eq(paquetes.organizacionId, organizationId))).limit(1))[0]
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
      <AdminPageHeader description="Paquetes prepagados: sesiones de un servicio que el cliente paga por adelantado." title="Paquetes" />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4" method="get">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <PaqueteForm
          initial={editingData}
          key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`}
          organizationId={organizationId}
          serviciosItems={serviciosItems}
        />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/paquetes", { organizationId })} />}>
              Nuevo
            </Button>
          }
          className="self-start"
          description={`${paqueteRows.length} resultado(s)`}
          title="Paquetes registrados"
        >
          {paqueteRows.length === 0 ? (
            <EmptyState description="Crea un paquete de sesiones prepagadas para venderlo en el punto de venta." title="No hay paquetes" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
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
                    <tr className="border-b border-[#f1eeea]" key={paquete.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{paquete.clave}</td>
                      <td className="py-3 pr-4 font-medium">{paquete.nombre}</td>
                      <td className="py-3 pr-4 text-xs text-[#625b55]">{paquete.servicioNombre}</td>
                      <td className="py-3 pr-4 tabular-nums">{paquete.sesiones}</td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(paquete.precio, { currency: context.currency })}</td>
                      <td className="py-3 pr-4"><StatusBadge active={paquete.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-[#ded8d2] px-2.5 text-xs text-[#625b55] hover:bg-[#f8f7f5]" href={buildAdminHref("/paquetes", { organizationId, extra: { ...preserved, edit: paquete.id } })}>Editar</Link>
                          <form action={togglePaquete}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={paquete.id} />
                            <input name="activo" type="hidden" value={String(paquete.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-[#ded8d2] px-2.5 text-xs text-[#625b55] hover:bg-[#f8f7f5]" type="submit">{paquete.activo ? "Ocultar" : "Activar"}</button>
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
