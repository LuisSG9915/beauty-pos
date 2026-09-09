import { LoadingState } from "@/components/loading-state";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f8f7f5] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 h-12 w-64 animate-pulse rounded-xl bg-white" />
        <LoadingState />
      </div>
    </main>
  );
}
