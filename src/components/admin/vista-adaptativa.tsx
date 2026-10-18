import { Children, type ReactNode } from "react";

import { leerViewportPreference } from "@/lib/viewport-preference";

/**
 * Emite SOLO el layout que el usuario verá según la cookie `melena_viewport`
 * (el bootstrap inline la fija/corrige antes de pintar). Sin cookie — primera
 * visita — se emiten ambos y el CSS decide, como antes: mejora progresiva sin
 * regresión ni CLS.
 *
 * Uso: envolver los DOS bloques existentes, en orden `[móvil, escritorio]`
 * (tarjetas `md:hidden` primero, tabla `hidden md:block` después). Con la
 * cookie correcta solo se emite el layout visible en ese ancho.
 */
export async function VistaAdaptativa({ children }: { children: ReactNode }) {
  const preferida = await leerViewportPreference();
  if (!preferida) return <>{children}</>;
  const [movil, escritorio] = Children.toArray(children);
  return <>{preferida === "movil" ? movil : escritorio}</>;
}
