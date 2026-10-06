import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Lista de registros como tarjetas, solo para teléfono (`md:hidden`). La tabla
 * tradicional se conserva envuelta en `hidden md:block` desde `md` en
 * adelante; ambas se renderizan desde el servidor sin estado compartido.
 */
export function RegistroList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-3 md:hidden", className)}>{children}</div>;
}

export type RegistroCampo = {
  label: string;
  value: ReactNode;
};

/**
 * Tarjeta de un registro en la lista móvil: título, insignia opcional, pares
 * etiqueta/valor y acciones táctiles al pie.
 */
export function RegistroCard({
  titulo,
  subtitulo,
  badge,
  campos = [],
  acciones,
  className,
}: {
  titulo: ReactNode;
  /** Texto secundario bajo el título (clave, descripción corta, etc.). */
  subtitulo?: ReactNode;
  /** Insignia de estado alineada a la derecha del título. */
  badge?: ReactNode;
  campos?: RegistroCampo[];
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "anim-entrada rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-foreground">{titulo}</h3>
          {subtitulo ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitulo}</p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {campos.length > 0 ? (
        <dl className="mt-3 space-y-1.5">
          {campos.map((campo, index) => (
            <div
              className="flex items-baseline justify-between gap-3 text-sm"
              key={`${campo.label}-${index}`}
            >
              <dt className="shrink-0 text-xs text-muted-foreground">{campo.label}</dt>
              <dd className="min-w-0 text-right font-medium text-foreground">{campo.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {acciones ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {acciones}
        </div>
      ) : null}
    </article>
  );
}
