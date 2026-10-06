import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AdminBreadcrumb = {
  label: string;
  href?: string;
};

/** Migas de pan accesibles para el encabezado de página. */
export function AdminBreadcrumbs({
  items,
  className,
}: {
  items: AdminBreadcrumb[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Ruta de navegación" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li className="flex items-center gap-1" key={`${item.label}-${index}`}>
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="size-3 text-border" />
              ) : null}
              {item.href && !isLast ? (
                <Link className="font-medium text-primary hover:underline" href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type AdminPageHeaderProps = ComponentProps<"header"> & {
  title: string;
  description?: string;
  breadcrumbs?: AdminBreadcrumb[];
  /** Acciones a la derecha del título (botones, links). */
  actions?: ReactNode;
};

/**
 * Encabezado de página del panel: migas de pan, título, descripción y
 * acciones, sin duplicar el header global del shell.
 */
export function AdminPageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
  ...props
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <AdminBreadcrumbs className="mb-2" items={breadcrumbs} />
        ) : null}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

type AdminSectionProps = ComponentProps<"section"> & {
  title?: string;
  description?: string;
  actions?: ReactNode;
};

/**
 * Sección de contenido con encabezado opcional (título + acciones).
 */
export function AdminSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: AdminSectionProps) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type AdminCardProps = ComponentProps<"section"> & {
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** Entrada animada al montar la tarjeta (plan de animaciones). */
  animate?: boolean;
};

/**
 * Tarjeta contenedora con encabezado opcional.
 */
export function AdminCard({
  title,
  description,
  actions,
  animate = false,
  className,
  children,
  ...props
}: AdminCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6",
        animate && "anim-entrada",
        className,
      )}
      {...props}
    >
      {title || actions ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-semibold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
