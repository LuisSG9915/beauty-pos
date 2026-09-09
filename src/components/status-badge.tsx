export function StatusBadge({ active = true }: { active?: boolean }) {
  return (
    <span className={active ? "inline-flex rounded-full bg-[#eaf5ed] px-2.5 py-1 text-xs font-medium text-[#347052]" : "inline-flex rounded-full bg-[#f1eeea] px-2.5 py-1 text-xs font-medium text-[#625b55]"}>
      {active ? "Activo" : "Oculto"}
    </span>
  );
}
