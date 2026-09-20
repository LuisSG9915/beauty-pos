"use client";

import { useEffect, useRef } from "react";

const UTM_CLAVES = ["utm_source", "utm_medium", "utm_campaign"] as const;

/**
 * Dispara una sola vez el ping de visita a /api/telemetria. Lee los UTM de la
 * URL en el cliente (así las páginas de marketing siguen siendo estáticas) y
 * nunca bloquea ni muestra errores al visitante.
 */
export function TelemetriaPing({ origen }: { origen: "landing" | "precios" }) {
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const clave of UTM_CLAVES) {
      const valor = params.get(clave);
      if (valor) utm[clave] = valor.slice(0, 160);
    }
    fetch("/api/telemetria", {
      body: JSON.stringify({
        tipo: "visita",
        origen,
        utm: Object.keys(utm).length > 0 ? utm : undefined,
      }),
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => {});
  }, [origen]);

  return null;
}
