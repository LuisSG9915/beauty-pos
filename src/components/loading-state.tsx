import { cn } from "@/lib/utils";

/**
 * Skeleton accesible con `role="status"` para cargas en progreso.
 */
export function LoadingState({
  rows = 5,
  label = "Cargando",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div aria-label={label} className={cn("space-y-3", className)} role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          aria-hidden="true"
          className="h-16 animate-pulse rounded-xl border border-border bg-card"
          key={index}
        />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
