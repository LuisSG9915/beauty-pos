import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { InvitationForm } from "@/app/admin/invitation-form";
import { OrganizationForm } from "@/app/admin/organization-form";
import { AdminNav } from "@/components/admin-nav";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catRoles } from "@/db/schema/access";
import { organizaciones, sucursales } from "@/db/schema/core";
import { getAccessibleOrganizations } from "@/lib/admin-context";
import { requireAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/access";
import { resolveAccessSafe } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  "permiso-denegado": "No tienes permiso para acceder a esa sección.",
  "organization-access-denied": "No tienes acceso a esa organización.",
};

function AccessError({ error }: { error?: string }) {
  const message = error ? ERROR_MESSAGES[error] : undefined;
  if (!message) return null;
  return (
    <p className="rounded-xl border border-[#f0c8be] bg-[#fdf1ee] px-4 py-3 text-sm text-[#a8443a]" role="alert">
      {message}
    </p>
  );
}

function MemberDashboard({
  name,
  access,
  error,
  permissionsByOrg,
}: {
  name: string;
  email: string;
  access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }>;
  error?: string;
  permissionsByOrg: Record<string, string[]>;
}) {
  const first = access[0];
  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        actions={
          first ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/agenda", { organizationId: first.organizationId, sucursalId: first.branchId })} />}>
              Ir a la agenda
            </Button>
          ) : undefined
        }
        description="Tu acceso fue configurado correctamente. Estas son las sucursales asignadas a tu cuenta."
        title={`Bienvenido, ${name}`}
      />
      {access.length === 0 ? (
        <EmptyState description="Tu cuenta todavía no tiene una sucursal asignada. Contacta al administrador." title="Sin sucursal asignada" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {access.map((item) => (
            <Link
              className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm transition-colors hover:border-[#c9a899] focus-visible:outline-2 focus-visible:outline-[#8a5140]"
              href={buildAdminHref("/agenda", { organizationId: item.organizationId, sucursalId: item.branchId })}
              key={`${item.organizationId}-${item.branchId}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8795d]">Organización</p>
              <h2 className="mt-2 text-xl font-semibold text-[#2d2926]">{item.organization}</h2>
              <p className="mt-3 text-sm text-[#81746c]">Sucursal: {item.branch} ({item.branchKey})</p>
            </Link>
          ))}
        </div>
      )}
      {first ? (
        <AdminNav
          organizationId={first.organizationId}
          permissions={permissionsByOrg[first.organizationId] ?? []}
          sucursalId={first.branchId}
        />
      ) : null}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const { session, user } = await requireAuthenticatedUser();
  const db = getDatabase();

  if (!user.esAdministradorPlataforma) {
    const organizations = await getAccessibleOrganizations(db, user);
    const access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }> = [];
    const permissionsByOrg: Record<string, string[]> = {};

    for (const org of organizations) {
      const resolved = await resolveAccessSafe(org.id, user);
      permissionsByOrg[org.id] = resolved ? [...resolved.permissions] : [];
      const branchConditions = [eq(sucursales.organizacionId, org.id), eq(sucursales.activo, true)];
      // null = alcance de toda la organización; Set = solo asignadas.
      if (resolved?.branchIds) {
        if (resolved.branchIds.size === 0) continue;
        branchConditions.push(inArray(sucursales.id, [...resolved.branchIds]));
      }
      const branchRows = await db
        .select({ id: sucursales.id, nombre: sucursales.nombre, clave: sucursales.clave })
        .from(sucursales)
        .where(and(...branchConditions))
        .orderBy(asc(sucursales.nombre));
      for (const branch of branchRows) {
        access.push({
          organization: org.nombre,
          branch: branch.nombre,
          branchKey: branch.clave,
          organizationId: org.id,
          branchId: branch.id,
        });
      }
    }

    return <MemberDashboard access={access} email={session.user.email} error={error} name={session.user.name} permissionsByOrg={permissionsByOrg} />;
  }

  const { session: platformSession } = await requirePlatformAdmin();
  const [organizations, roles, branches] = await Promise.all([
    db
      .select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug, activo: organizaciones.activo })
      .from(organizaciones)
      .orderBy(desc(organizaciones.createdAt)),
    db.select({ id: catRoles.id, organizacionId: catRoles.organizacionId, nombre: catRoles.nombre }).from(catRoles),
    db.select({ id: sucursales.id, organizacionId: sucursales.organizacionId, nombre: sucursales.nombre, clave: sucursales.clave }).from(sucursales),
  ]);

  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        description={`Hola, ${platformSession.user.name}. Crea negocios y prepara su primera sucursal.`}
        title="Organizaciones y sucursales"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <OrganizationForm />
        <AdminCard description={`${organizations.length} organización(es)`} title="Organizaciones registradas">
          {organizations.length === 0 ? (
            <EmptyState description="Todavía no hay organizaciones. Crea la primera desde el formulario." title="Sin organizaciones" />
          ) : (
            <div className="space-y-3">
              {organizations.map((organization) => (
                <div className="flex items-center justify-between rounded-xl border border-[#eee6e0] px-4 py-3" key={organization.id}>
                  <div>
                    <p className="font-medium">{organization.nombre}</p>
                    <p className="mt-1 text-xs text-[#95877e]">{organization.slug}</p>
                  </div>
                  <StatusBadge tone={organization.activo ? "success" : "neutral"}>
                    {organization.activo ? "Activa" : "Inactiva"}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
      <InvitationForm branches={branches} organizations={organizations} roles={roles} />
    </div>
  );
}
