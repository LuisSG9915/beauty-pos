"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** Submit de venta directa con confirmación inmediata y bloqueo idempotente. */
export function VentaDirectaSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Button
        className="rounded-xl font-semibold"
        data-action-clave="1"
        data-action-id="pos.venta.abrir"
        disabled={disabled || pending}
        size="touch"
        type="submit"
      >
        {pending ? "Iniciando venta…" : "Iniciar cobro directo"}
      </Button>
    </>
  );
}
