"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** Submit de venta directa con confirmación inmediata y bloqueo idempotente. */
export function VentaDirectaSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      className="rounded-xl"
      data-action-clave="1"
      data-action-id="pos.venta.abrir"
      disabled={disabled || pending}
      size="touch"
      type="submit"
    >
      {pending ? "Abriendo venta…" : "Abrir venta"}
    </Button>
  );
}
