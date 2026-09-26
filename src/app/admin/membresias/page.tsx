import { and, asc, eq, ilike } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleMembresia } from "@/app/admin/membresias/actions";
import { MembresiaForm } from "@/app/admin/membresias/membresia-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { membresias } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const APLICA_LABEL: Record<string, string> = {
  ambos: "Servicios y productos",
  servicio: "Solo servicios",
  producto: "Solo productos",
};

export default async function MembresiasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const suscripcion = await contextoSuscripcion(organizationId);
  if (!suscripcion.capacidades.has("membresias")) {
    return (
      <PlanUpgradeNotice
        capacidad="membresias"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const estado = firstParam(params.estado) ?? "";

  const filters = [eq(membresias.organizacionId, organizationId)];
  if (query) filters.push(ilike(membresias.nombre, `%${query}%`));
  if (estado === "activo") filters.push(eq(membresias.activo, true));
  if (estado === "oculto") filters.push(eq(membresias.activo, false));

  const membresiaRows = await db
    .select({
      id: membresias.id,
      clave: membresias.clave,
      nombre: membresias.nombre,
      duracionDias: membresias.duracionDias,
      descuentoPorcentaje: membresias.descuentoPorcentaje,
      aplica: membresias.aplica,
      precio: membresias.precio,
      activo: membresias.activo,
    })
    .from(membresias)
    .where(and(...filters))
    .orderBy(asc(membresias.nombre))
    .limit(100);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select().from(membresias).where(and(eq(membresias.id, editId), eq(membresias.organizacionId, organizationId))).limit(1))[0]
    : undefined;
  const editingData = editing
    ? {
        id: editing.id,
        organizacionId: editing.organizacionId,
        clave: editing.clave,
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        duracionDias: editing.duracionDias,
        descuentoPorcentaje: editing.descuentoPorcentaje,
        aplica: editing.aplica,
        precio: editing.precio,
      }
    : undefined;

  const hasFilters = Boolean(query || estado);
  const preserved = { q: query || null, estado: estado || null };

  return (
    <div className="space-y-6">
      <AdminPageHeader description="Membresías: descuento porcentual por tiempo limitado que el cliente compra por adelantado." title="Membresías" />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-52 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre de la membresía" />
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
          <Button nativeButton={false} render={<Link href={buildAdminHref("/membresias", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.membresias.nueva"
            nativeButton={false}
            render={<Link href={buildAdminHref("/membresias", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${membresiaRows.length} resultado(s)`}
        title="Membresías registradas"
      >
        {membresiaRows.length === 0 ? (
          <EmptyState description="Crea una membresía para venderla en el punto de venta y dar descuento a tus clientes." title="No hay membresías" />
        ) : (
          <>
            <RegistroList>
              {membresiaRows.map((membresia) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/membresias", { organizationId, extra: { ...preserved, edit: membresia.id } })}>Editar</Link>
                      <form action={toggleMembresia}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={membresia.id} />
                        <input name="activo" type="hidden" value={String(membresia.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">{membresia.activo ? "Ocultar" : "Activar"}</button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={membresia.activo} />}
                  campos={[
                    { label: "Descuento", value: `${Number(membresia.descuentoPorcentaje)}% · ${APLICA_LABEL[membresia.aplica] ?? membresia.aplica}` },
                    { label: "Duración", value: `${membresia.duracionDias} días` },
                    { label: "Precio", value: formatCurrency(membresia.precio, { currency: context.currency }) },
                  ]}
                  key={membresia.id}
                  subtitulo={<span className="font-mono">{membresia.clave}</span>}
                  titulo={membresia.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Descuento</th>
                    <th className="py-2 pr-4 font-medium">Duración</th>
                    <th className="py-2 pr-4 font-medium">Precio</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {membresiaRows.map((membresia) => (
                    <tr className="border-b border-border" key={membresia.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{membresia.clave}</td>
                      <td className="py-3 pr-4 font-medium">{membresia.nombre}</td>
                      <td className="py-3 pr-4 text-xs tabular-nums text-muted-foreground">
                        {Number(membresia.descuentoPorcentaje)}% · {APLICA_LABEL[membresia.aplica] ?? membresia.aplica}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{membresia.duracionDias} días</td>
                      <td className="py-3 pr-4 tabular-nums">{formatCurrency(membresia.precio, { currency: context.currency })}</td>
                      <td className="py-3 pr-4"><StatusBadge active={membresia.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/membresias", { organizationId, extra: { ...preserved, edit: membresia.id } })}>Editar</Link>
                          <form action={toggleMembresia}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={membresia.id} />
                            <input name="activo" type="hidden" value={String(membresia.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">{membresia.activo ? "Ocultar" : "Activar"}</button>
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
          closeHref={buildAdminHref("/membresias", { organizationId, extra: preserved })}
          description={editing ? "Ajusta los datos de la membresía." : "Crea una membresía de descuento por vigencia."}
          title={editing ? "Editar membresía" : "Nueva membresía"}
        >
          <MembresiaForm
            initial={editingData}
            key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`}
            organizationId={organizationId}
          />
        </FormSheet>
      ) : null}
    </div>
  );
}
