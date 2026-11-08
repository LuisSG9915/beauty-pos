import { Children, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { leerViewportPreference, type ViewportPreference } from "@/lib/viewport-preference";

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
export async function VistaAdaptativa({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  let preferida: ViewportPreference | null = null;
  try {
    preferida = await leerViewportPreference();
  } catch {
    preferida = null;
  }
  const lista = Children.toArray(children);
  if (!preferida || lista.length !== 2) {
    return <div className={cn("w-full min-w-0", className)}>{children}</div>;
  }
  const [movil, escritorio] = lista;
  return <div className={cn("w-full min-w-0", className)}>{preferida === "movil" ? movil : escritorio}</div>;
}
