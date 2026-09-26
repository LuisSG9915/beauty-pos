import { LoadingState } from "@/components/loading-state";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div aria-hidden="true" className="h-8 w-56 animate-pulse rounded-xl bg-muted/60" />
        <div aria-hidden="true" className="h-4 w-72 max-w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
      <LoadingState label="Cargando" rows={4} />
    </div>
  );
}
