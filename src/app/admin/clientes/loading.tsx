import { LoadingState } from "@/components/loading-state";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-12 w-64 animate-pulse rounded-xl bg-white" />
      <LoadingState />
    </div>
  );
}
