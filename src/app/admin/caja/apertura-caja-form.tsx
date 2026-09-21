"use client";

import { useActionState } from "react";

import { abrirCaja, type CajaActionState } from "@/app/admin/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

const initialState: CajaActionState = {};

export function AperturaCajaForm({
  organizationId,
  sucursalId,
}: {
  organizationId: string;
  sucursalId: string;
}) {
  const [state, formAction, pending] = useActionState(abrirCaja, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />

      <Field>
        <FieldLabel required>Fondo inicial (efectivo en caja)</FieldLabel>
        <Input inputMode="decimal" min="0" name="fondoInicial" placeholder="0.00" required step="0.01" type="number" />
      </Field>
      <Field>
        <FieldLabel>Notas</FieldLabel>
        <Textarea name="notas" placeholder="Observaciones de apertura" rows={2} />
      </Field>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" data-action-id="caja.apertura.confirmar" disabled={pending} size="touch" type="submit">
        {pending ? "Abriendo…" : "Abrir caja"}
      </Button>
    </form>
  );
}
