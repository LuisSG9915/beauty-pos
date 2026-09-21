"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
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
      className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-[#eadfd8] bg-white px-6 py-12 text-center shadow-sm"
      role="alert"
    >
      <h2 className="text-xl font-semibold text-[#2d2926]">
        No se pudo cargar esta sección
      </h2>
      <p className="mt-3 text-sm leading-6 text-[#6e6159]">
        Ocurrió un problema al cargar el contenido. Intenta de nuevo; si el
        problema persiste, vuelve al panel o contacta a soporte.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-[#a89a91]">
          Referencia: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          className="min-h-10 rounded-xl"
          onClick={() => retry()}
          type="button"
        >
          Reintentar
        </Button>
        <Link
          className="inline-flex min-h-10 items-center rounded-xl border border-[#ded8d2] bg-white px-4 text-sm font-medium text-[#625b55] transition-colors hover:bg-[#faf6f3] hover:text-[#8a5140]"
          href="/admin"
        >
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
