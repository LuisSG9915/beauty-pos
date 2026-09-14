import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "info" | "destructive" | "neutral";

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * Insignia de estado. Conserva la API anterior (`active`) y añade
 * `tone` + `children` para estados arbitrarios (p. ej. estados de cita/venta).
 */
export function StatusBadge({
  active = true,
  tone,
  activeLabel = "Activo",
  inactiveLabel = "Oculto",
  children,
  className,
}: {
  active?: boolean;
  /** Tono semántico; si se omite se deriva de `active`. */
  tone?: StatusTone;
  activeLabel?: string;
  inactiveLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const resolvedTone = tone ?? (active ? "success" : "neutral");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        toneStyles[resolvedTone],
        className,
      )}
    >
      {children ?? (active ? activeLabel : inactiveLabel)}
    </span>
  );
}
