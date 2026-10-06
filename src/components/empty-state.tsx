import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Acción opcional de recuperación (link o botón). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "anim-entrada flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-8 text-primary/70" strokeWidth={1.7} />
      ) : null}
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
