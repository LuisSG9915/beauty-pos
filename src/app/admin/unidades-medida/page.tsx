import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleUnit } from "@/app/admin/unidades-medida/actions";
import { UnitForm } from "@/app/admin/unidades-medida/unit-form";
import { CrudRowActions } from "@/components/admin/crud-actions";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catUnidadesMedida } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function UnitsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const units = await db
    .select({ id: catUnidadesMedida.id, clave: catUnidadesMedida.clave, nombre: catUnidadesMedida.nombre, activo: catUnidadesMedida.activo })
    .from(catUnidadesMedida)
    .where(eq(catUnidadesMedida.organizacionId, organizationId))
    .orderBy(asc(catUnidadesMedida.nombre));
  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select({ id: catUnidadesMedida.id, clave: catUnidadesMedida.clave, nombre: catUnidadesMedida.nombre, updatedAt: catUnidadesMedida.updatedAt }).from(catUnidadesMedida).where(and(eq(catUnidadesMedida.id, editId), eq(catUnidadesMedida.organizacionId, organizationId))).limit(1))[0]
    : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/productos", { organizationId })} />} variant="outline">
            Ver productos
          </Button>
        }
        description="Unidades usadas por productos e insumos en inventario."
        title="Unidades de medida"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <UnitForm initial={editing} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/unidades-medida", { organizationId })} />}>
              Nueva
            </Button>
          }
          className="self-start"
          description={`${units.length} resultado(s)`}
          title="Unidades registradas"
        >
          {units.length === 0 ? (
            <EmptyState description="Crea unidades como pieza, litro, gramo o mililitro para el inventario." title="No hay unidades" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr className="border-b border-[#f1eeea]" key={unit.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{unit.clave}</td>
                      <td className="py-3 pr-4 font-medium">{unit.nombre}</td>
                      <td className="py-3 pr-4"><StatusBadge active={unit.activo} /></td>
                      <td className="py-3">
                        <CrudRowActions
                          activo={unit.activo}
                          editHref={buildAdminHref("/unidades-medida", { organizationId, extra: { edit: unit.id } })}
                          id={unit.id}
                          organizationId={organizationId}
                          toggleAction={toggleUnit}
                        />
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
