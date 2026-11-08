import { LoadingState } from "@/components/loading-state";

export default function Loading() {
  return (
    <div aria-label="Cargando" aria-live="polite" className="space-y-6" role="status">
      <div className="h-12 w-64 animate-pulse rounded-xl bg-muted/60" />
      <LoadingState />
    </div>
  );
}
