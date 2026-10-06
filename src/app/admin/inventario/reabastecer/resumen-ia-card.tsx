"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { generarResumenReabasto } from "@/app/admin/inventario/reabastecer/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Tarjeta "Resumen" del plan 12: botón bajo demanda (no automático, para no
 * gastar cuota) que redacta 3–5 puntos a partir de los números del reporte.
 * La página solo la monta cuando existe el binding `AI`.
 */
export function ResumenIaCard({
  organizacionId,
  sucursalId,
  dias,
}: {
  organizacionId: string;
  sucursalId: string;
  dias: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [puntos, setPuntos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Si cambia el objetivo de días el resumen anterior ya no corresponde:
  // ajuste de estado durante el render (patrón oficial), no en un effect.
  const [diasPrev, setDiasPrev] = useState(dias);
  if (dias !== diasPrev) {
    setDiasPrev(dias);
    setPuntos(null);
    setError(null);
  }

  const generar = () => {
    startTransition(async () => {
      setError(null);
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("sucursalId", sucursalId);
      data.set("dias", String(dias));
      const state = await generarResumenReabasto(data);
      if (state.success && state.data?.puntos?.length) {
        setPuntos(state.data.puntos);
      } else {
        const mensaje = state.error ?? "No se pudo generar el resumen.";
        setPuntos(null);
        setError(mensaje);
        if (state.error && state.error !== "No se pudo generar el resumen.") {
          toast.error(mensaje);
        }
      }
    });
  };

  return (
    <div className="space-y-3">
      <Button
        data-action-id="reabastecer.resumen.generar"
        disabled={pending}
        onClick={generar}
        type="button"
        variant="outline"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        {pending ? "Generando…" : puntos ? "Generar de nuevo" : "Generar resumen"}
      </Button>
      {puntos ? (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-foreground">
          {puntos.map((punto, index) => (
            <li key={index}>{punto}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        El resumen solo redacta los números del reporte; las cantidades siempre salen de la fórmula.
      </p>
    </div>
  );
}
