import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MemberInviteForm } from "@/app/admin/usuarios/member-invite-form";
import { MemberCard, PendingInvitations, type MemberRow } from "@/app/admin/usuarios/member-card";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { catRoles, invitacionesUsuarios, relMiembrosRoles } from "@/db/schema/access";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales, usuarios } from "@/db/schema/core";
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
  // El editor solo puede otorgar sucursales dentro de su propio alcance;
  // `context.branches` ya viene filtrado por `access.branchIds`.
  const assignableBranches = context.branches.map((branch) => ({
    id: branch.id,
    nombre: branch.nombre,
    clave: branch.clave,
  }));

  const memberRows = await db
    .select({
      miembroId: miembrosOrganizaciones.id,
      usuarioId: miembrosOrganizaciones.usuarioId,
      estado: miembrosOrganizaciones.estado,
      nombre: usuarios.nombre,
      correo: usuarios.correo,
    })
    .from(miembrosOrganizaciones)
    .innerJoin(usuarios, eq(miembrosOrganizaciones.usuarioId, usuarios.id))
    .where(eq(miembrosOrganizaciones.organizacionId, organizationId))
    .orderBy(asc(usuarios.nombre));

  const roles = await db
    .select({ id: catRoles.id, clave: catRoles.clave, nombre: catRoles.nombre, esSistema: catRoles.esSistema })
    .from(catRoles)
    .where(and(eq(catRoles.organizacionId, organizationId), eq(catRoles.activo, true)))
    .orderBy(asc(catRoles.nombre));

  const memberIds = memberRows.map((m) => m.miembroId);
  const [memberRoles, memberBranches, invitations] = await Promise.all([
    memberIds.length
      ? db
          .select({ miembroId: relMiembrosRoles.miembroOrganizacionId, rolId: relMiembrosRoles.rolId })
          .from(relMiembrosRoles)
          .where(inArray(relMiembrosRoles.miembroOrganizacionId, memberIds))
      : Promise.resolve([]),
    memberIds.length
      ? db
          .select({ usuarioId: relUsuariosSucursales.usuarioId, sucursalId: relUsuariosSucursales.sucursalId })
          .from(relUsuariosSucursales)
          .where(eq(relUsuariosSucursales.organizacionId, organizationId))
      : Promise.resolve([]),
    db
      .select({
        id: invitacionesUsuarios.id,
        correo: invitacionesUsuarios.correo,
        nombre: invitacionesUsuarios.nombre,
        expiraAt: invitacionesUsuarios.expiraAt,
        sucursalId: invitacionesUsuarios.sucursalId,
        rolId: invitacionesUsuarios.rolId,
      })
      .from(invitacionesUsuarios)
      .where(and(eq(invitacionesUsuarios.organizacionId, organizationId), eq(invitacionesUsuarios.estado, "pendiente")))
      .orderBy(asc(invitacionesUsuarios.correo)),
  ]);

  const branchNames = new Map(assignableBranches.map((b) => [b.id, `${b.nombre} (${b.clave})`]));
  // Nombres de sucursales aunque estén fuera del alcance del editor (solo lectura).
  const allBranchNames = new Map(
    (await db
      .select({ id: sucursales.id, nombre: sucursales.nombre, clave: sucursales.clave })
      .from(sucursales)
      .where(eq(sucursales.organizacionId, organizationId))
    ).map((b) => [b.id, `${b.nombre} (${b.clave})`]),
  );
  for (const [id, nombre] of branchNames) allBranchNames.set(id, nombre);
  const roleNames = new Map(roles.map((r) => [r.id, r.nombre]));

  const members: MemberRow[] = memberRows.map((m) => ({
    miembroId: m.miembroId,
    usuarioId: m.usuarioId,
    estado: m.estado,
    nombre: m.nombre,
    correo: m.correo,
    rolIds: memberRoles.filter((r) => r.miembroId === m.miembroId).map((r) => r.rolId),
    sucursalIds: memberBranches.filter((b) => b.usuarioId === m.usuarioId).map((b) => b.sucursalId),
  }));

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
        description="Miembros de la organización, sus roles y sucursales asignadas."
        title="Equipo"
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          {members.length === 0 ? (
            <EmptyState description="Todavía no hay miembros en esta organización." title="Sin miembros" />
          ) : (
            members.map((member) => (
              <MemberCard
                allBranchNames={Object.fromEntries(allBranchNames)}
                assignableBranches={assignableBranches}
                canEdit={canEdit && member.usuarioId !== context.user.id}
                isSelf={member.usuarioId === context.user.id}
                key={member.miembroId}
                member={member}
                organizationId={organizationId}
                roles={roles}
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
