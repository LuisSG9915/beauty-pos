import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleServiceCategory } from "@/app/admin/categorias-servicios/actions";
import { CategoryForm } from "@/app/admin/categorias-servicios/category-form";
import { CrudRowActions } from "@/components/admin/crud-actions";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catCategoriasServicios } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function ServiceCategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const categories = await db
    .select({ id: catCategoriasServicios.id, clave: catCategoriasServicios.clave, nombre: catCategoriasServicios.nombre, descripcion: catCategoriasServicios.descripcion, activo: catCategoriasServicios.activo })
    .from(catCategoriasServicios)
    .where(eq(catCategoriasServicios.organizacionId, organizationId))
    .orderBy(asc(catCategoriasServicios.nombre));
  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select({ id: catCategoriasServicios.id, clave: catCategoriasServicios.clave, nombre: catCategoriasServicios.nombre, descripcion: catCategoriasServicios.descripcion, updatedAt: catCategoriasServicios.updatedAt }).from(catCategoriasServicios).where(and(eq(catCategoriasServicios.id, editId), eq(catCategoriasServicios.organizacionId, organizationId))).limit(1))[0]
    : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/servicios", { organizationId })} />} variant="outline">
            Ver servicios
          </Button>
        }
        description="Agrupa los servicios del salón."
        title="Categorías de servicios"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <CategoryForm initial={editing} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-servicios", { organizationId })} />}>
              Nueva
            </Button>
          }
          className="self-start"
          description={`${categories.length} resultado(s)`}
          title="Categorías registradas"
        >
          {categories.length === 0 ? (
            <EmptyState description="Crea categorías para organizar los servicios del salón." title="No hay categorías" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Descripción</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr className="border-b border-[#f1eeea]" key={category.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{category.clave}</td>
                      <td className="py-3 pr-4 font-medium">{category.nombre}</td>
                      <td className="py-3 pr-4 text-xs text-[#625b55]">{category.descripcion ?? "—"}</td>
                      <td className="py-3 pr-4"><StatusBadge active={category.activo} /></td>
                      <td className="py-3">
                        <CrudRowActions
                          activo={category.activo}
                          editHref={buildAdminHref("/categorias-servicios", { organizationId, extra: { edit: category.id } })}
                          id={category.id}
                          organizationId={organizationId}
                          toggleAction={toggleServiceCategory}
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
