import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "info" | "destructive" | "neutral";

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  info: "bg-info-soft text-info-soft-foreground",
  destructive: "bg-destructive-soft text-destructive-soft-foreground",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Insignia de estado. Conserva la API anterior (`active`) y añade
 * `tone` + `children` para estados arbitrarios (p. ej. estados de cita/venta).
 * `icon` permite reforzar el significado sin depender solo del color.
 */
export function StatusBadge({
  active = true,
  tone,
  icon,
  activeLabel = "Activo",
  inactiveLabel = "Oculto",
  children,
  className,
}: {
  active?: boolean;
  /** Tono semántico; si se omite se deriva de `active`. */
  tone?: StatusTone;
  /** Icono opcional (lucide) a la izquierda del texto. */
  icon?: ReactNode;
  activeLabel?: string;
  inactiveLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const resolvedTone = tone ?? (active ? "success" : "neutral");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-op-xs font-semibold [&_svg]:size-3.5",
        toneStyles[resolvedTone],
        className,
      )}
    >
      {icon}
      {children ?? (active ? activeLabel : inactiveLabel)}
    </span>
  );
}
