import { AdminShell } from "@/components/admin/admin-shell";
import type { BillingBadge } from "@/components/admin/subscription-banner";
import { OfflineSyncBadge } from "@/components/offline-sync";
import { redirect } from "next/navigation";

import { getSessionOrRedirect } from "@/lib/auth/access";
import { resolveSessionContext } from "@/lib/auth/authorization";
import { leerSucursalesCookieMap } from "@/lib/sucursal-cookie";
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
  const session = await getSessionOrRedirect();
  // Usuario + organizaciones en la consulta de contexto única (compartida con
  // la página vía React.cache cuando coincide la organización pedida).
  const contextRow = await resolveSessionContext(session.user.id, null);
  const user = contextRow.usuario;
  if (!user) {
    redirect("/login?error=account-not-configured");
  }
  const organizations = contextRow.organizaciones;

  // Permisos por organización para filtrar la navegación del shell: ya viajan
  // embebidos en la consulta de contexto (sin una ronda extra por org).
  // Admin de plataforma → null (sin filtro).
  let permissionsByOrg: Record<string, string[]> | null = null;
  const billingByOrg: Record<string, BillingBadge> = {};
  const capacidadesFaltantesByOrg: Record<string, string[]> = {};
  if (!user.esAdministradorPlataforma) {
    permissionsByOrg = {};
    const suscripciones = await Promise.all(
      organizations.map((org) => getSuscripcionActualCache(org.id)),
    );
    for (const [index, org] of organizations.entries()) {
      const suscripcion = suscripciones[index] ?? null;
      permissionsByOrg[org.id] = org.permisos ?? [];
      // Solo se ocultan accesos cuando el plan vigente no los incluye; una
      // suscripción vencida conserva el acceso de consulta (solo lectura).
      if (suscripcion && estadoEfectivoSuscripcion(suscripcion) === "vigente") {
        const incluidas = new Set(suscripcion.capacidades ?? []);
        capacidadesFaltantesByOrg[org.id] = Object.keys(CAPACIDADES).filter(
          (capacidad) => !incluidas.has(capacidad),
        );
      }
      if (estadoEfectivoSuscripcion(suscripcion) === "vencida") {
        billingByOrg[org.id] = { estado: "vencida", diasRestantes: null };
      } else if (suscripcion?.estado === "trialing") {
        billingByOrg[org.id] = {
          estado: "trialing",
          diasRestantes: diasRestantesTrial(suscripcion),
        };
      }
    }
  }

  // Preferencias de sucursal (cookies httpOnly `melena_sucursal_*`): el shell
  // las usa solo para MOSTRAR la misma sucursal que el servidor resuelve; la
  // validación de alcance siempre ocurre del lado del servidor.
  const sucursalPreferidaPorOrg = await leerSucursalesCookieMap();

  return (
    <AdminShell
      billingByOrg={billingByOrg}
      capacidadesFaltantesByOrg={capacidadesFaltantesByOrg}
      isPlatformAdmin={user.esAdministradorPlataforma}
      organizations={organizations}
      permissionsByOrg={permissionsByOrg}
      sucursalPreferidaPorOrg={sucursalPreferidaPorOrg}
      userEmail={session.user.email}
      userName={session.user.name}
    >
      <OfflineSyncBadge />
      {children}
    </AdminShell>
  );
}
