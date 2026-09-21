import { LoadingState } from "@/components/loading-state";

export default function AdminLoading() {
  return (
    <div aria-label="Cargando sección" className="space-y-6" role="status">
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <LoadingState rows={4} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
