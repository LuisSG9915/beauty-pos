import { LoadingState } from "@/components/loading-state";

export default function ReportesLoading() {
  return (
    <div aria-label="Cargando reportes" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-52 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <LoadingState rows={4} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
