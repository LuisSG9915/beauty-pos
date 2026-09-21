import { LoadingState } from "@/components/loading-state";

export default function CajaLoading() {
  return (
    <div aria-label="Cargando caja" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-32 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
      </div>
      <LoadingState rows={2} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
