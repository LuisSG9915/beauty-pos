import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoleCard } from "@/app/admin/roles/role-card";
import { RoleForm } from "@/app/admin/roles/role-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, EQUIPO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

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

  type RolesSqlRow = {
    roles: Array<{
      id: string;
      clave: string;
      nombre: string;
      esSistema: boolean;
      activo: boolean;
      permisoIds: string[];
      memberCount: number;
    }>;
    permisos: Array<{ id: string; clave: string; nombre: string; modulo: string }>;
  };

  // Roles (con sus permisos y conteo de miembros embebidos) + catálogo de
  // permisos activos en UNA sola consulta SQL (antes 4 queries en 2 rondas).
  const { rows } = await db.execute<RolesSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select
            r.id,
            r.clave,
            r.nombre,
            r.es_sistema as "esSistema",
            r.activo,
            coalesce((
              select jsonb_agg(rp.permiso_id)
              from rel_roles_permisos rp
              where rp.rol_id = r.id
            ), '[]'::jsonb) as "permisoIds",
            (
              select count(*)::int
              from rel_miembros_roles mr
              where mr.rol_id = r.id
            ) as "memberCount"
          from cat_roles r
          where r.organizacion_id = ${organizationId}
          order by r.nombre asc
        ) t
      ), '[]'::jsonb) as roles,
      coalesce((
        select jsonb_agg(t) from (
          select p.id, p.clave, p.nombre, p.modulo
          from cat_permisos p
          where p.activo = true
          order by p.modulo asc, p.clave asc
        ) t
      ), '[]'::jsonb) as permisos
  `);

  const datos = rows[0];
  const roles = datos?.roles ?? [];
  const permisos = datos?.permisos ?? [];

  // Solo se ofrecen para asignación los permisos que el editor ya posee
  // (anti-escalamiento también reforzado en la acción).
  const ownPermissions = context.access.esPlataforma
    ? new Set(permisos.map((p) => p.clave))
    : context.access.permissions;
  const permisosAsignables = permisos.filter((p) => ownPermissions.has(p.clave));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          canEdit ? (
            <Button
              data-action-clave="1"
              data-action-id="roles.rol.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/roles", { organizationId, extra: { nuevo: "rol" } })} />}
              size="lg"
            >
              Nuevo rol
            </Button>
          ) : undefined
        }
        description="Roles del equipo y los permisos que otorgan dentro de la organización."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={EQUIPO_TABS}
          />
        }
        title="Roles y permisos"
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          {roles.length === 0 ? (
            <EmptyState description="Crea un rol para asignar permisos al equipo." title="Sin roles configurados" />
          ) : (
            roles.map((role) => (
              <RoleCard
                canEdit={canEdit}
                memberCount={role.memberCount}
                organizationId={organizationId}
                permisoIds={role.permisoIds}
                permisos={permisos}
                permisosAsignables={permisosAsignables.map((p) => p.id)}
                role={role}
                key={role.id}
              />
            ))
          )}
        </div>
        <div className="space-y-4">
          <AdminCard title="Notas">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>El rol <strong>Propietario</strong> no se puede modificar ni desactivar.</li>
              <li>Solo puedes otorgar permisos que tú mismo tienes.</li>
              <li>Un rol con miembros asignados no se puede desactivar.</li>
            </ul>
          </AdminCard>
        </div>
      </div>

      {canEdit && firstParam(params.nuevo) === "rol" ? (
        <FormSheet
          closeHref={buildAdminHref("/roles", { organizationId })}
          description="Los permisos se asignan después de crear el rol."
          title="Nuevo rol"
        >
          <RoleForm organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
