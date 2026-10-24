import { AdminShell } from "@/components/admin/admin-shell";
import type { BillingBadge } from "@/components/admin/subscription-banner";
import { OfflineSyncBadge } from "@/components/offline-sync";

import { getAdminContext } from "@/lib/admin-context";
import { leerSucursalesCookieMap } from "@/lib/sucursal-cookie";
import { VIEWPORT_BOOTSTRAP_SCRIPT } from "@/lib/viewport-preference";
import { CAPACIDADES } from "@/modules/billing/capacidades";
import { obtenerEstadoSuscripcion } from "@/modules/billing/queries";
import { diasRestantesTrial, estadoEfectivoSuscripcion } from "@/modules/billing/rules";

export const dynamic = "force-dynamic";

/**
 * Layout del panel: autentica al usuario y resuelve las organizaciones
 * accesibles (todas para admins de plataforma; membresías activas para el
 * resto). El shell es client component y conserva el estado entre rutas.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // getAdminContext() está deduplicado por request con React.cache() y cacheado
  // en KV con TTL 60 s; layout y page comparten la misma promesa en vuelo.
  const context = await getAdminContext();
  const { user, organizations } = context;

  // Solo la suscripción por organización alimenta el shell (badges de plan y
  // capacidades). Las alertas y el progreso de onboarding viven en las páginas
  // que los muestran: cargarlos aquí abría conexiones extra y consultas cuyo
  // resultado se descartaba en cada request.
  const suscripciones = user.esAdministradorPlataforma
    ? []
    : await Promise.all(organizations.map((org) => obtenerEstadoSuscripcion(org.id)));

  // Permisos por organización para filtrar la navegación del shell: ya viajan
  // embebidos en la consulta de contexto (sin una ronda extra por org).
  // Admin de plataforma → null (sin filtro).
  let permissionsByOrg: Record<string, string[]> | null = null;
  const billingByOrg: Record<string, BillingBadge> = {};
  const capacidadesFaltantesByOrg: Record<string, string[]> = {};
  if (!user.esAdministradorPlataforma) {
    permissionsByOrg = {};
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
      userEmail={user.correo ?? ""}
      userName={user.nombre}
    >
      {/* Fija/corrige la cookie melena_viewport ANTES de pintar: el servidor
          emite solo el layout (tarjetas o tabla) que el usuario verá. Sin
          cookie (primera visita) no recarga y se renderizan ambos. */}
      <script dangerouslySetInnerHTML={{ __html: VIEWPORT_BOOTSTRAP_SCRIPT }} suppressHydrationWarning />
      <OfflineSyncBadge />
      {children}
    </AdminShell>
  );
}
