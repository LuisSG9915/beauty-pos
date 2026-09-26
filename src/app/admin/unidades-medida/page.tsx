import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleUnit } from "@/app/admin/unidades-medida/actions";
import { UnitForm } from "@/app/admin/unidades-medida/unit-form";
import { CrudRowActions } from "@/components/admin/crud-actions";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
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
      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.unidades_medida.nueva"
            nativeButton={false}
            render={<Link href={buildAdminHref("/unidades-medida", { organizationId, extra: { nuevo: "1" } })} />}
          >
            Nueva
          </Button>
        }
        description={`${units.length} resultado(s)`}
        title="Unidades registradas"
      >
        {units.length === 0 ? (
          <EmptyState description="Crea unidades como pieza, litro, gramo o mililitro para el inventario." title="No hay unidades" />
        ) : (
          <>
            <RegistroList>
              {units.map((unit) => (
                <RegistroCard
                  acciones={
                    <CrudRowActions
                      activo={unit.activo}
                      editHref={buildAdminHref("/unidades-medida", { organizationId, extra: { edit: unit.id } })}
                      id={unit.id}
                      organizationId={organizationId}
                      toggleAction={toggleUnit}
                    />
                  }
                  badge={<StatusBadge active={unit.activo} />}
                  key={unit.id}
                  subtitulo={<span className="font-mono">{unit.clave}</span>}
                  titulo={unit.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr className="border-b border-border" key={unit.id}>
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
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/unidades-medida", { organizationId })}
          description={editing ? "Ajusta los datos de la unidad." : "Crea una unidad para el inventario."}
          title={editing ? "Editar unidad" : "Nueva unidad"}
        >
          <UnitForm initial={editing} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
