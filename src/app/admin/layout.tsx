import { AdminShell } from "@/components/admin/admin-shell";
import type { BillingBadge } from "@/components/admin/subscription-banner";
import { OfflineSyncBadge } from "@/components/offline-sync";
import { getDatabase } from "@/db/client";
import { getAccessibleOrganizations } from "@/lib/admin-context";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveAccessSafe } from "@/lib/auth/authorization";
import { CAPACIDADES } from "@/modules/billing/capacidades";
import { getSuscripcionActualCache } from "@/modules/billing/queries";
import { diasRestantesTrial, estadoEfectivoSuscripcion } from "@/modules/billing/rules";

export const dynamic = "force-dynamic";

/**
 * Layout del panel: autentica al usuario y resuelve las organizaciones
 * accesibles (todas para admins de plataforma; membresías activas para el
 * resto). El shell es client component y conserva el estado entre rutas.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { session, user } = await requireAuthenticatedUser();
  const db = getDatabase();

  // La misma fuente cacheada que usa getAdminContext: una sola consulta por
  // request entre layout y página.
  const organizations = await getAccessibleOrganizations(db, user);

  // Permisos por organización para filtrar la navegación del shell.
  // Admin de plataforma → null (sin filtro).
  let permissionsByOrg: Record<string, string[]> | null = null;
  const billingByOrg: Record<string, BillingBadge> = {};
  const capacidadesFaltantesByOrg: Record<string, string[]> = {};
  if (!user.esAdministradorPlataforma) {
    permissionsByOrg = {};
    const resolved = await Promise.all(
      organizations.map(
        async (org) =>
          [
            org.id,
            await resolveAccessSafe(org.id, user),
            await getSuscripcionActualCache(org.id),
          ] as const,
      ),
    );
    for (const [orgId, access, suscripcion] of resolved) {
      permissionsByOrg[orgId] = access ? [...access.permissions] : [];
      // Solo se ocultan accesos cuando el plan vigente no los incluye; una
      // suscripción vencida conserva el acceso de consulta (solo lectura).
      if (suscripcion && estadoEfectivoSuscripcion(suscripcion) === "vigente") {
        const incluidas = new Set(suscripcion.capacidades ?? []);
        capacidadesFaltantesByOrg[orgId] = Object.keys(CAPACIDADES).filter(
          (capacidad) => !incluidas.has(capacidad),
        );
      }
      if (estadoEfectivoSuscripcion(suscripcion) === "vencida") {
        billingByOrg[orgId] = { estado: "vencida", diasRestantes: null };
      } else if (suscripcion?.estado === "trialing") {
        billingByOrg[orgId] = {
          estado: "trialing",
          diasRestantes: diasRestantesTrial(suscripcion),
        };
      }
    }
  }

  return (
    <AdminShell
      billingByOrg={billingByOrg}
      capacidadesFaltantesByOrg={capacidadesFaltantesByOrg}
      isPlatformAdmin={user.esAdministradorPlataforma}
      organizations={organizations}
      permissionsByOrg={permissionsByOrg}
      userEmail={session.user.email}
      userName={session.user.name}
    >
      <OfflineSyncBadge />
      {children}
    </AdminShell>
  );
}
