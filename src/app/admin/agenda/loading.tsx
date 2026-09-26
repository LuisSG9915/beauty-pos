import { LoadingState } from "@/components/loading-state";

export default function AgendaLoading() {
  return (
    <div aria-label="Cargando agenda" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-56 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-28 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-10 w-40 animate-pulse rounded-xl bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <LoadingState rows={3} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
