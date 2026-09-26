import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleServiceCategory } from "@/app/admin/categorias-servicios/actions";
import { CategoryForm } from "@/app/admin/categorias-servicios/category-form";
import { CrudRowActions } from "@/components/admin/crud-actions";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
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
      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.categorias_servicios.nueva"
            nativeButton={false}
            render={<Link href={buildAdminHref("/categorias-servicios", { organizationId, extra: { nuevo: "1" } })} />}
          >
            Nueva
          </Button>
        }
        description={`${categories.length} resultado(s)`}
        title="Categorías registradas"
      >
        {categories.length === 0 ? (
          <EmptyState description="Crea categorías para organizar los servicios del salón." title="No hay categorías" />
        ) : (
          <>
            <RegistroList>
              {categories.map((category) => (
                <RegistroCard
                  acciones={
                    <CrudRowActions
                      activo={category.activo}
                      editHref={buildAdminHref("/categorias-servicios", { organizationId, extra: { edit: category.id } })}
                      id={category.id}
                      organizationId={organizationId}
                      toggleAction={toggleServiceCategory}
                    />
                  }
                  badge={<StatusBadge active={category.activo} />}
                  campos={[{ label: "Descripción", value: category.descripcion ?? "—" }]}
                  key={category.id}
                  subtitulo={<span className="font-mono">{category.clave}</span>}
                  titulo={category.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
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
                    <tr className="border-b border-border" key={category.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{category.clave}</td>
                      <td className="py-3 pr-4 font-medium">{category.nombre}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{category.descripcion ?? "—"}</td>
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
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/categorias-servicios", { organizationId })}
          description={editing ? "Ajusta los datos de la categoría." : "Crea una categoría para agrupar servicios."}
          title={editing ? "Editar categoría" : "Nueva categoría"}
        >
          <CategoryForm initial={editing} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
