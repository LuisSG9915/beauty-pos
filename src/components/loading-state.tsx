export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-label="Cargando" className="space-y-3" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="h-16 animate-pulse rounded-xl border border-[#eee8e3] bg-white" key={index} />
      ))}
    </div>
  );
}
