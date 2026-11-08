"use client";

import { useActionState } from "react";

import { abrirCaja, type CajaActionState } from "@/app/admin/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { fieldError } from "@/lib/action-state";

const initialState: CajaActionState = {};

export function AperturaCajaForm({
  organizationId,
  sucursalId,
}: {
  organizationId: string;
  sucursalId: string;
}) {
  const [state, formAction, pending] = useActionState(abrirCaja, initialState);
  const fe = (name: string) => fieldError(state, name);

  return (
    <form action={formAction} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />

      <Field>
        <FieldLabel required>Fondo inicial (efectivo en caja)</FieldLabel>
        <Input inputMode="decimal" invalid={Boolean(fe("fondoInicial"))} min="0" name="fondoInicial" placeholder="0.00" required step="0.01" type="number" />
        <FieldError error={fe("fondoInicial")} />
      </Field>
      <Field>
        <FieldLabel>Notas</FieldLabel>
        <Textarea invalid={Boolean(fe("notas"))} name="notas" placeholder="Observaciones de apertura" rows={2} />
        <FieldError error={fe("notas")} />
      </Field>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" data-action-id="caja.apertura.confirmar" disabled={pending} size="touch" type="submit">
        {pending ? "Abriendo…" : "Abrir caja"}
      </Button>
    </form>
  );
}
