"use client";

import { useActionState, useState } from "react";

import { cancelarFactura } from "@/app/admin/facturacion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action-state";
import { MOTIVOS_CANCELACION } from "@/modules/facturacion/sat";

/** Solicita la cancelación de un comprobante emitido (motivo SAT + UUID sustituto si es 01). */
export function CancelarFacturaForm({
  organizationId,
  comprobanteId,
  compact = false,
}: {
  organizationId: string;
  comprobanteId: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelarFactura, {});
  const [motivo, setMotivo] = useState("02");

  return (
    <form action={formAction} className={compact ? "flex flex-wrap items-end gap-2" : "grid gap-3 sm:grid-cols-[1fr_1fr_auto]"}>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="comprobanteId" type="hidden" value={comprobanteId} />
      <Field className={compact ? "w-56" : undefined}>
        <FieldLabel>Motivo SAT</FieldLabel>
        <Select name="motivo" onChange={(e) => setMotivo(e.target.value)} value={motivo}>
          {MOTIVOS_CANCELACION.map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.clave} · {m.nombre}
            </option>
          ))}
        </Select>
      </Field>
      {motivo === "01" ? (
        <Field className={compact ? "w-64" : undefined}>
          <FieldLabel required>UUID que lo sustituye</FieldLabel>
          <Input name="uuidSustitucion" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" required />
        </Field>
      ) : (
        <input name="uuidSustitucion" type="hidden" value="" />
      )}
      <Button className="rounded-xl" disabled={pending} type="submit" variant="outline">
        {pending ? "Cancelando…" : "Cancelar comprobante"}
      </Button>
      <div className="w-full">
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
