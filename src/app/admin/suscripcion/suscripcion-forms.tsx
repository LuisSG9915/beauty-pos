"use client";

import { useActionState } from "react";

import { solicitarCancelacion, solicitarCambioPlan } from "@/app/admin/suscripcion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { fieldError } from "@/lib/action-state";

/** Solicita el cambio a otro plan del catálogo (la activación es manual). */
export function CambioPlanForm({
  organizacionId,
  planClave,
  periodicidadActual,
  sucursalesActuales,
}: {
  organizacionId: string;
  planClave: string;
  periodicidadActual: string;
  sucursalesActuales: number;
}) {
  const [state, formAction, isPending] = useActionState(solicitarCambioPlan, {});
  const fe = (name: string) => fieldError(state, name);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="organizacionId" type="hidden" value={organizacionId} />
      <input name="planClave" type="hidden" value={planClave} />
      <Field className="w-32">
        <FieldLabel>Periodicidad</FieldLabel>
        <Select defaultValue={periodicidadActual === "anual" ? "anual" : "mensual"} name="periodicidad">
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </Select>
      </Field>
      <Field className="w-28">
        <FieldLabel>Sucursales</FieldLabel>
        <Input defaultValue={sucursalesActuales} invalid={Boolean(fe("sucursalesFacturadas"))} min={1} max={50} name="sucursalesFacturadas" required type="number" />
        <FieldError error={fe("sucursalesFacturadas")} />
      </Field>
      <Button className="rounded-xl" disabled={isPending} size="sm" type="submit" variant="outline">
        {isPending ? "Enviando…" : "Solicitar este plan"}
      </Button>
      <div className="w-full">
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}

/** Solicita la cancelación conservando el acceso hasta el fin del periodo. */
export function CancelacionForm({ organizacionId }: { organizacionId: string }) {
  const [state, formAction, isPending] = useActionState(solicitarCancelacion, {});
  const fe = (name: string) => fieldError(state, name);

  return (
    <form action={formAction} className="space-y-3">
      <input name="organizacionId" type="hidden" value={organizacionId} />
      <Field>
        <FieldLabel required>Motivo de la cancelación</FieldLabel>
        <Input invalid={Boolean(fe("motivo"))} maxLength={500} name="motivo" placeholder="Cuéntanos qué podríamos mejorar" required />
        <FieldError error={fe("motivo")} />
      </Field>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={isPending} size="sm" type="submit" variant="outline">
        {isPending ? "Registrando…" : "Solicitar cancelación"}
      </Button>
    </form>
  );
}
