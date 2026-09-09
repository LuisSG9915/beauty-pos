import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description }: { icon?: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#ded8d2] bg-white px-6 py-12 text-center">
      {Icon ? <Icon className="size-8 text-[#a88777]" strokeWidth={1.7} /> : null}
      <h3 className="mt-4 font-semibold text-[#2d2926]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#625b55]">{description}</p>
    </div>
  );
}
