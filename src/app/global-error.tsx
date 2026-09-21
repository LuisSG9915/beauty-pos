"use client";

import { useEffect } from "react";

import { reportarErrorCliente } from "@/lib/observability/reportar-error";

/**
 * Error boundary raíz: reemplaza el layout entero, así que define su propio
 * documento. Los estilos globales no aplican aquí — estilos inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportarErrorCliente({ error, digest: error.digest });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          alignItems: "center",
          backgroundColor: "#faf9f7",
          color: "#2d2926",
          display: "flex",
          fontFamily: "system-ui, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100dvh",
          padding: 24,
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Algo salió mal</h1>
          <p style={{ color: "#625b55", fontSize: 14, lineHeight: 1.6, marginTop: 12, maxWidth: 360 }}>
            Ocurrió un error inesperado. Intenta de nuevo; si el problema persiste, contacta a soporte.
          </p>
          {error.digest ? <p style={{ color: "#a89a91", fontSize: 12, marginTop: 8 }}>Referencia: {error.digest}</p> : null}
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: "#8a5140",
              border: 0,
              borderRadius: 12,
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              marginTop: 20,
              padding: "10px 20px",
            }}
            type="button"
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
