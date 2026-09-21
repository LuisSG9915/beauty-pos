import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleProductCategory } from "@/app/admin/categorias-productos/actions";
import { ProductCategoryForm } from "@/app/admin/categorias-productos/product-category-form";
import { CrudRowActions } from "@/components/admin/crud-actions";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catCategoriasProductos } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function ProductCategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const categories = await db
    .select({ id: catCategoriasProductos.id, clave: catCategoriasProductos.clave, nombre: catCategoriasProductos.nombre, activo: catCategoriasProductos.activo })
    .from(catCategoriasProductos)
    .where(eq(catCategoriasProductos.organizacionId, organizationId))
    .orderBy(asc(catCategoriasProductos.nombre));
  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select({ id: catCategoriasProductos.id, clave: catCategoriasProductos.clave, nombre: catCategoriasProductos.nombre, updatedAt: catCategoriasProductos.updatedAt }).from(catCategoriasProductos).where(and(eq(catCategoriasProductos.id, editId), eq(catCategoriasProductos.organizacionId, organizationId))).limit(1))[0]
    : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/productos", { organizationId })} />} variant="outline">
            Ver productos
          </Button>
        }
        description="Agrupa productos e insumos del catálogo."
        title="Categorías de productos"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <ProductCategoryForm initial={editing} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-productos", { organizationId })} />}>
              Nueva
            </Button>
          }
          className="self-start"
          description={`${categories.length} resultado(s)`}
          title="Categorías registradas"
        >
          {categories.length === 0 ? (
            <EmptyState description="Crea categorías para organizar los productos e insumos del salón." title="No hay categorías" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr className="border-b border-border" key={category.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{category.clave}</td>
                      <td className="py-3 pr-4 font-medium">{category.nombre}</td>
                      <td className="py-3 pr-4"><StatusBadge active={category.activo} /></td>
                      <td className="py-3">
                        <CrudRowActions
                          activo={category.activo}
                          editHref={buildAdminHref("/categorias-productos", { organizationId, extra: { edit: category.id } })}
                          id={category.id}
                          organizationId={organizationId}
                          toggleAction={toggleProductCategory}
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
