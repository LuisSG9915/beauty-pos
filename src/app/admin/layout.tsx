import { and, asc, eq } from "drizzle-orm";

import { AdminShell } from "@/components/admin/admin-shell";
import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveAccessSafe } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

/**
 * Layout del panel: autentica al usuario y resuelve las organizaciones
 * accesibles (todas para admins de plataforma; membresías activas para el
 * resto). El shell es client component y conserva el estado entre rutas.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { session, user } = await requireAuthenticatedUser();
  const db = getDatabase();

  const organizations = user.esAdministradorPlataforma
    ? await db
        .select({
          id: organizaciones.id,
          nombre: organizaciones.nombre,
          slug: organizaciones.slug,
          activo: organizaciones.activo,
        })
        .from(organizaciones)
        .orderBy(asc(organizaciones.nombre))
    : await db
        .select({
          id: organizaciones.id,
          nombre: organizaciones.nombre,
          slug: organizaciones.slug,
          activo: organizaciones.activo,
        })
        .from(miembrosOrganizaciones)
        .innerJoin(
          organizaciones,
          eq(miembrosOrganizaciones.organizacionId, organizaciones.id),
        )
        .where(
          and(
            eq(miembrosOrganizaciones.usuarioId, user.id),
            eq(miembrosOrganizaciones.estado, "activo"),
          ),
        )
        .orderBy(asc(organizaciones.nombre));

  // Permisos por organización para filtrar la navegación del shell.
  // Admin de plataforma → null (sin filtro).
  let permissionsByOrg: Record<string, string[]> | null = null;
  if (!user.esAdministradorPlataforma) {
    permissionsByOrg = {};
    const resolved = await Promise.all(
      organizations.map(async (org) => [org.id, await resolveAccessSafe(org.id, user)] as const),
    );
    for (const [orgId, access] of resolved) {
      permissionsByOrg[orgId] = access ? [...access.permissions] : [];
    }
  }

  return (
    <AdminShell
      isPlatformAdmin={user.esAdministradorPlataforma}
      organizations={organizations}
      permissionsByOrg={permissionsByOrg}
      userEmail={session.user.email}
      userName={session.user.name}
    >
      {children}
    </AdminShell>
  );
}
