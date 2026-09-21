import { LoadingState } from "@/components/loading-state";

export default function MiDiaLoading() {
  return (
    <div aria-label="Cargando Mi día" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <LoadingState rows={3} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
