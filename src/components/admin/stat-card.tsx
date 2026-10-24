import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  /** Texto secundario breve bajo la cifra. */
  hint?: string;
  icon?: LucideIcon;
  className?: string;
};

/**
 * KPI compacto del patrón operativo de Melena: etiqueta, cifra grande y un
 * detalle opcional. Pensado para filas de 2–4 tarjetas sobre el contenido.
 */
export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <p className="truncate text-op-xs font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} /> : null}
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 line-clamp-2 text-op-xs leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Fila responsiva de KPIs: 2 columnas en móvil, hasta 4 en escritorio. */
export function StatCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 min-w-0 max-w-full", className)}>
      {children}
    </div>
  );
}
