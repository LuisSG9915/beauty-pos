import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MemberInviteForm } from "@/app/admin/usuarios/member-invite-form";
import { MemberCard, PendingInvitations, type MemberRow } from "@/app/admin/usuarios/member-card";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, EQUIPO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

export default async function UsuariosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "usuarios.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const canInvite = hasPermission(context.access, "usuarios.invitar");
  const canEdit = hasPermission(context.access, "usuarios.editar");
  // El control de sucursales comparte `setUsuarioSucursalesAction`, protegida
  // por `sucursales.editar`.
  const canEditBranches =
    hasPermission(context.access, "sucursales.editar") && !context.access.soloLectura;
  // El editor solo puede otorgar sucursales dentro de su propio alcance;
  // `context.branches` ya viene filtrado por `access.branchIds`.
  const assignableBranches = context.branches.map((branch) => ({
    id: branch.id,
    nombre: branch.nombre,
  }));

  type UsuariosSqlRow = {
    miembros: MemberRow[];
    roles: Array<{ id: string; clave: string; nombre: string; esSistema: boolean }>;
    invitaciones: Array<{
      id: string;
      correo: string;
      nombre: string;
      expiraAt: string;
      sucursalId: string | null;
      rolId: string | null;
    }>;
    sucursales: Array<{ id: string; nombre: string; activo: boolean }>;
  };

  // Miembros (con sus roles y sucursales activas asignadas), catálogo de
  // roles, invitaciones pendientes y nombres de sucursales en UNA sola ronda
  // SQL (antes eran 6 consultas en 4 rondas secuenciales).
  const { rows } = await db.execute<UsuariosSqlRow>(sql`
    select
      coalesce((
        select jsonb_agg(t) from (
          select
            mo.id as "miembroId",
            mo.usuario_id as "usuarioId",
            mo.estado,
            u.nombre,
            u.correo,
            coalesce((
              select jsonb_agg(rmr.rol_id)
              from rel_miembros_roles rmr
              where rmr.miembro_organizacion_id = mo.id
            ), '[]'::jsonb) as "rolIds",
            coalesce((
              select jsonb_agg(rus.sucursal_id)
              from rel_usuarios_sucursales rus
              join sucursales s on s.id = rus.sucursal_id and s.activo
              where rus.organizacion_id = ${organizationId}
                and rus.usuario_id = mo.usuario_id
            ), '[]'::jsonb) as "sucursalIds"
          from miembros_organizaciones mo
          join usuarios u on u.id = mo.usuario_id
          where mo.organizacion_id = ${organizationId}
          order by u.nombre asc
        ) t
      ), '[]'::jsonb) as miembros,
      coalesce((
        select jsonb_agg(t) from (
          select r.id, r.clave, r.nombre, r.es_sistema as "esSistema"
          from cat_roles r
          where r.organizacion_id = ${organizationId} and r.activo = true
          order by r.nombre asc
        ) t
      ), '[]'::jsonb) as roles,
      coalesce((
        select jsonb_agg(t) from (
          select
            inv.id,
            inv.correo,
            inv.nombre,
            to_char(inv.expira_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "expiraAt",
            inv.sucursal_id as "sucursalId",
            inv.rol_id as "rolId"
          from invitaciones_usuarios inv
          where inv.organizacion_id = ${organizationId} and inv.estado = 'pendiente'
          order by inv.correo asc
        ) t
      ), '[]'::jsonb) as invitaciones,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'activo', s.activo))
        from sucursales s
        where s.organizacion_id = ${organizationId}
      ), '[]'::jsonb) as sucursales
  `);

  const datos = rows[0];
  const members: MemberRow[] = datos?.miembros ?? [];
  const roles = datos?.roles ?? [];
  const invitations = (datos?.invitaciones ?? []).map((inv) => ({
    ...inv,
    expiraAt: new Date(inv.expiraAt),
  }));
  const allBranches = datos?.sucursales ?? [];

  const branchNames = new Map(assignableBranches.map((b) => [b.id, b.nombre]));
  const allBranchNames = new Map(allBranches.map((b) => [b.id, b.nombre]));
  for (const [id, nombre] of branchNames) allBranchNames.set(id, nombre);
  const roleNames = new Map(roles.map((r) => [r.id, r.nombre]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          canInvite ? (
            <Button
              data-action-clave="1"
              data-action-id="usuarios.invitacion.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/usuarios", { organizationId, extra: { nuevo: "invitacion" } })} />}
              size="lg"
            >
              Invitar miembro
            </Button>
          ) : undefined
        }
        description="Miembros del negocio, sus roles y las sucursales donde trabajan."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={EQUIPO_TABS}
          />
        }
        title="Equipo"
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          {members.length === 0 ? (
            <EmptyState description="Todavía no hay miembros en este negocio." title="Sin miembros" />
          ) : (
            members.map((member) => (
              <MemberCard
                allBranchNames={Object.fromEntries(allBranchNames)}
                assignableBranches={assignableBranches}
                canEdit={canEdit && member.usuarioId !== context.user.id}
                canEditBranches={canEditBranches && member.usuarioId !== context.user.id}
                isSelf={member.usuarioId === context.user.id}
                key={member.miembroId}
                member={member}
                organizationId={organizationId}
                roles={roles}
                sucursalActualId={context.sucursalId}
              />
            ))
          )}
        </div>
        <div className="space-y-4">
          <PendingInvitations
            canCancel={canInvite}
            invitations={invitations.map((inv) => ({
              id: inv.id,
              correo: inv.correo,
              nombre: inv.nombre,
              expiraAt: inv.expiraAt,
              rolNombre: inv.rolId ? (roleNames.get(inv.rolId) ?? "—") : "—",
              sucursalNombre: inv.sucursalId ? (allBranchNames.get(inv.sucursalId) ?? "—") : "—",
            }))}
            organizationId={organizationId}
          />
        </div>
      </div>

      {canInvite && firstParam(params.nuevo) === "invitacion" ? (
        <FormSheet
          closeHref={buildAdminHref("/usuarios", { organizationId })}
          description="El correo recibirá un enlace de acceso."
          title="Invitar miembro"
        >
          <MemberInviteForm
            branches={assignableBranches}
            organizationId={organizationId}
            roles={roles.map((r) => ({ id: r.id, nombre: r.nombre }))}
          />
        </FormSheet>
      ) : null}
    </div>
  );
}
