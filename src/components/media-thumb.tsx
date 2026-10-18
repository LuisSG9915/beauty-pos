/* eslint-disable @next/next/no-img-element -- Las imágenes se sirven desde
   /api/medios con sesión del usuario; el optimizador de next/image no reenvía
   cookies al fetchear la URL interna y devolvería 401. */
import { cn } from "@/lib/utils";

/**
 * Miniatura cuadrada de un medio R2 con degradado a la inicial del nombre
 * cuando no hay imagen (o el binding falta — el `<img>` devuelve 404 y el
 * alt vacío simplemente no pinta nada). `<img>` plano porque la URL exige
 * sesión; `next/image` no reenvía cookies al fetchear la URL interna.
 */
export function MediaThumb({
  claveR2,
  className,
  nombre,
}: {
  claveR2?: string | null;
  className?: string;
  /** Texto del que sale la inicial del placeholder. */
  nombre: string;
}) {
  if (claveR2) {
    return (
      <img
        alt=""
        className={cn(
          "size-9 shrink-0 rounded-lg border border-border bg-muted object-cover",
          className,
        )}
        loading="lazy"
        src={`/api/medios/${encodeURI(claveR2)}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-op-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {nombre.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}
