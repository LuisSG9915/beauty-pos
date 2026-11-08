import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Paginación compartida para listados admin. Muestra la página actual (y el
 * total cuando se conoce) y los enlaces Anterior/Siguiente. Los hrefs se
 * construyen en la página para conservar filtros y contexto de org/sucursal.
 */
export function Paginacion({
  hasMore,
  hrefAnterior,
  hrefSiguiente,
  pagina,
  total,
  totalPaginas,
}: {
  hasMore: boolean;
  hrefAnterior?: string | null;
  hrefSiguiente?: string | null;
  pagina: number;
  total?: number;
  totalPaginas?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        Página {pagina}
        {totalPaginas ? ` de ${totalPaginas}` : ""}
        {typeof total === "number" ? ` · ${total} registro(s)` : ""}
      </span>
      <div className="flex gap-2">
        {hrefAnterior ? (
          <Button
            className="min-h-11"
            nativeButton={false}
            render={<Link href={hrefAnterior} />}
            variant="outline"
          >
            ← Anterior
          </Button>
        ) : null}
        {hrefSiguiente && hasMore ? (
          <Button
            className="min-h-11"
            nativeButton={false}
            render={<Link href={hrefSiguiente} />}
            variant="outline"
          >
            Siguiente →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
