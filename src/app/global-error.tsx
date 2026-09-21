"use client";

import { useEffect } from "react";

import { BOOTSTRAP_SCRIPT } from "@/lib/theme-preference";
import { reportarErrorCliente } from "@/lib/observability/reportar-error";

const GLOBAL_ERROR_STYLES = `
  :root {
    color-scheme: light;
    --background: #faf9fb;
    --foreground: #241922;
    --muted-foreground: #6f6069;
    --primary: #a91d5d;
    --primary-foreground: #fff7fb;
    --ring: #a91d5d;
  }
  .dark {
    color-scheme: dark;
    --background: #1a1117;
    --foreground: #faf0f5;
    --muted-foreground: #bdabb5;
    --primary: #f0649d;
    --primary-foreground: #3b0b25;
    --ring: #f0649d;
  }
`;

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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_ERROR_STYLES }} />
      </head>
      <body
        style={{
          alignItems: "center",
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
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
          <p style={{ color: "var(--muted-foreground)", fontSize: 14, lineHeight: 1.6, marginTop: 12, maxWidth: 360 }}>
            Ocurrió un error inesperado. Intenta de nuevo; si el problema persiste, contacta a soporte.
          </p>
          {error.digest ? <p style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 8 }}>Referencia: {error.digest}</p> : null}
          <button
            onClick={() => reset()}
            style={{
              backgroundColor: "var(--primary)",
              border: 0,
              borderRadius: 12,
              color: "var(--primary-foreground)",
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
