"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { explicarErrorOperativo } from "@/lib/glosario";
import { reportarErrorCliente } from "@/lib/observability/reportar-error";

/**
 * Error boundary del panel. Muestra un mensaje genérico sin exponer
 * detalles sensibles del error y permite reintentar la carga.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Registrar para diagnóstico; el mensaje visible sigue siendo genérico.
    console.error(error);
    reportarErrorCliente({ error, digest: error.digest });
  }, [error]);

  return (
    <div
      className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center shadow-sm"
      role="alert"
    >
      <h2 className="text-xl font-semibold text-foreground">
        No se pudo cargar esta sección
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {explicarErrorOperativo(error?.message)}
      </p>
      {error.digest ? (
        <p className="mt-2 text-op-xs text-muted-foreground">
          Referencia: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          className="min-h-11 rounded-xl"
          onClick={() => retry()}
          type="button"
        >
          Reintentar
        </Button>
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
          href="/admin"
        >
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
