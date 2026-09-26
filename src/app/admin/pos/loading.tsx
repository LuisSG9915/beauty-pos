import { LoadingState } from "@/components/loading-state";

export default function PosLoading() {
  return (
    <div aria-label="Cargando cobro" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <LoadingState rows={3} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
