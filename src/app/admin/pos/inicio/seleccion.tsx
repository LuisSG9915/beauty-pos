"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  CARACTERISTICAS_POS,
} from "@/modules/pos/caracteristicas";
import { TarjetaCaracteristicaPos } from "@/components/admin/pos/tarjeta-caracteristica-pos";
import { guardarSeleccionCaracteristicasPos } from "./actions";

/** Pantalla inicial del POS: la dueña elige qué características aparecen. */
export function PosInicioSeleccion({
  organizationId,
  negocioNombre,
  configuracionInicial,
}: {
  organizationId: string;
  negocioNombre: string;
  configuracionInicial: Record<string, boolean>;
}) {
  const [valores, setValores] = useState<Record<string, boolean>>(
    configuracionInicial,
  );

  const toggle = (clave: string, siguiente: boolean) => {
    setValores((actual: Record<string, boolean>) => ({
    ...actual,
    [clave]: siguiente,
  }));
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="rounded-xl border border-background bg-card p-6 shadow-sm">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2.5">
          <h2 className="text-op-sm font-semibold">
            Elige qué quieres usar
          </h2>
          <p className="text-op-xs text-muted-foreground">
            {negocioNombre} · Punto de venta
          </p>
        </div>
        <p className="text-op-xs text-muted-foreground mb-6">
          Marca lo que aparece en tu punto de venta. Lo puedes cambiar después
          desde la configuración.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARACTERISTICAS_POS.map((c) => (
            <TarjetaCaracteristicaPos
              key={c.clave}
              caracteristica={c}
              activo={valores[c.clave] ?? c.activaPorDefecto}
              onCambiar={(siguiente) => toggle(c.clave, siguiente)}
            />
          ))}
        </div>
      </div>

      <form action={guardarSeleccionCaracteristicasPos}>
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="valores" type="hidden" value={JSON.stringify(valores)} />
        <div className="flex justify-end">
          <FormSubmit />
        </div>
      </form>
    </div>
  );
}

function FormSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      aria-busy={pending}
      className="w-full min-h-11 rounded-xl font-semibold"
      data-action-clave="1"
      data-action-id="pos.inicio.abrir"
      disabled={pending}
      size="touch"
      type="submit"
    >
      {pending ? "Guardando…" : "Abrir punto de venta"}
    </Button>
  );
}
