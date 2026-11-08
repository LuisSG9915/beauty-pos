import { type ReactNode } from "react";

import { VistaAdaptativaClient } from "./vista-adaptativa-client";
import { leerViewportPreference } from "@/lib/viewport-preference";

/**
 * Server Component wrapper que lee la cookie `melena_viewport` y renderiza
 * el Client Component con la preferencia resuelta.
 * Evita importar `next/headers` en Client Components.
 */
export async function VistaAdaptativa({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  let preferida: Awaited<ReturnType<typeof leerViewportPreference>> = null;
  try {
    preferida = await leerViewportPreference();
  } catch {
    preferida = null;
  }
  return <VistaAdaptativaClient viewport={preferida} className={className}>{children}</VistaAdaptativaClient>;
}