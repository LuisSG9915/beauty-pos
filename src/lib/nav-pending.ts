/**
 * Señal de "navegación cliente en curso" para el rescate de
 * `NavigationActivity` (admin-shell). Los clicks en anchors ya los detecta el
 * listener global del shell; las navegaciones programáticas (`router.push`,
 * `router.replace`, selects que disparan un form con redirect) avisan por este
 * evento con la URL destino para que el mismo red de seguridad las cubra.
 */
export const NAV_PENDING_EVENT = "melena:nav-pending";

export function reportarNavegacionPendiente(href: string) {
  if (typeof window === "undefined" || !href) return;
  window.dispatchEvent(
    new CustomEvent<{ href: string }>(NAV_PENDING_EVENT, { detail: { href } }),
  );
}
