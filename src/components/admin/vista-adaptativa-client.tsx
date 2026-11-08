"use client";

import { Children, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ViewportPreference } from "@/lib/viewport-preference";

/**
 * Versión Client Component de VistaAdaptativa.
 * Recibe la preferencia de viewport como prop (resuelta en Server Component).
 */
export function VistaAdaptativaClient({
  children,
  className,
  viewport,
}: {
  children: ReactNode;
  className?: string;
  viewport: ViewportPreference | null;
}) {
  const lista = Children.toArray(children);
  if (!viewport || lista.length !== 2) {
    return <div className={cn("w-full min-w-0", className)}>{children}</div>;
  }
  const [movil, escritorio] = lista;
  return <div className={cn("w-full min-w-0", className)}>{viewport === "movil" ? movil : escritorio}</div>;
}