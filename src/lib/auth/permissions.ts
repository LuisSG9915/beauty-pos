/**
 * Helpers de permisos puros (sin dependencias de Next.js runtime).
 * Usables en Client Components, Server Components y Server Actions.
 */

/**
 * Claves de permiso que habilitan la administración del plan/suscripción.
 * Centralizado para uso coherente en banner, UI de settings, etc.
 */
export const PERMISOS_ADMIN_PLAN = ["organizaciones.editar", "sucursales.editar"] as const;

/**
 * Determina si los permisos del usuario en una organización permiten
 * administrar el plan/suscripción (ver CTA "Ver planes", cambiar plan, etc.).
 * `permisos === null` → admin de plataforma (acceso total).
 */
export function puedeAdministrarPlan(permisos: readonly string[] | null): boolean {
  if (permisos === null) return true;
  return PERMISOS_ADMIN_PLAN.some((p) => permisos.includes(p));
}