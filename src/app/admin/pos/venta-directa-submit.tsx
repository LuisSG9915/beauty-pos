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
        aria-busy={pending}
        className="w-full min-h-11 rounded-xl font-semibold"
        data-action-clave="1"
        data-action-id="pos.venta.abrir"
        disabled={disabled || pending}
        size="touch"
        type="submit"
      >
        {pending ? "Abriendo venta…" : "Abrir venta directa"}
      </Button>
    </>
  );
}
