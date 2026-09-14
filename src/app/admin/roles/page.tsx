import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { RoleCard } from "@/app/admin/roles/role-card";
import { RoleForm } from "@/app/admin/roles/role-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relMiembrosRoles, relRolesPermisos } from "@/db/schema/access";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function RolesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "roles.ver");
  const organizationId = context.organization.id;
  const canEdit = hasPermission(context.access, "roles.editar");
  const db = getDatabase();

  const [roles, permisos] = await Promise.all([
    db
      .select({
        id: catRoles.id,
        clave: catRoles.clave,
        nombre: catRoles.nombre,
        esSistema: catRoles.esSistema,
        activo: catRoles.activo,
      })
      .from(catRoles)
      .where(eq(catRoles.organizacionId, organizationId))
      .orderBy(asc(catRoles.nombre)),
    db
      .select({ id: catPermisos.id, clave: catPermisos.clave, nombre: catPermisos.nombre, modulo: catPermisos.modulo })
      .from(catPermisos)
      .where(eq(catPermisos.activo, true))
      .orderBy(asc(catPermisos.modulo), asc(catPermisos.clave)),
  ]);

  const roleIds = roles.map((r) => r.id);
  const [rolePermisos, memberCounts] = await Promise.all([
    roleIds.length
      ? db
          .select({ rolId: relRolesPermisos.rolId, permisoId: relRolesPermisos.permisoId })
          .from(relRolesPermisos)
          .where(inArray(relRolesPermisos.rolId, roleIds))
      : Promise.resolve([]),
    roleIds.length
      ? db
          .select({ rolId: relMiembrosRoles.rolId })
          .from(relMiembrosRoles)
          .where(inArray(relMiembrosRoles.rolId, roleIds))
      : Promise.resolve([]),
  ]);

  const countByRole = new Map<string, number>();
  for (const row of memberCounts) {
    countByRole.set(row.rolId, (countByRole.get(row.rolId) ?? 0) + 1);
  }

  // Solo se ofrecen para asignación los permisos que el editor ya posee
  // (anti-escalamiento también reforzado en la acción).
  const ownPermissions = context.access.esPlataforma
    ? new Set(permisos.map((p) => p.clave))
    : context.access.permissions;
  const permisosAsignables = permisos.filter((p) => ownPermissions.has(p.clave));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Roles del equipo y los permisos que otorgan dentro de la organización."
        title="Roles y permisos"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          {roles.map((role) => (
            <RoleCard
              canEdit={canEdit}
              memberCount={countByRole.get(role.id) ?? 0}
              organizationId={organizationId}
              permisoIds={rolePermisos.filter((rp) => rp.rolId === role.id).map((rp) => rp.permisoId)}
              permisos={permisos}
              permisosAsignables={permisosAsignables.map((p) => p.id)}
              role={role}
              key={role.id}
            />
          ))}
        </div>
        <div className="space-y-4">
          {canEdit ? (
            <AdminCard description="Los permisos se asignan después de crear el rol." title="Nuevo rol">
              <RoleForm organizationId={organizationId} />
            </AdminCard>
          ) : null}
          <AdminCard title="Notas">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#625b55]">
              <li>El rol <strong>Propietario</strong> no se puede modificar ni desactivar.</li>
              <li>Solo puedes otorgar permisos que tú mismo tienes.</li>
              <li>Un rol con miembros asignados no se puede desactivar.</li>
            </ul>
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
