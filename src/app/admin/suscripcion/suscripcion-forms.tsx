"use client";

import { useActionState } from "react";

import { solicitarCancelacion, solicitarCambioPlan } from "@/app/admin/suscripcion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

/** Solicita el cambio a otro plan del catálogo (la activación es manual). */
export function CambioPlanForm({
  organizacionId,
  planClave,
  periodicidadActual,
}: {
  organizacionId: string;
  planClave: string;
  periodicidadActual: string;
}) {
  const [state, formAction, isPending] = useActionState(solicitarCambioPlan, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="organizacionId" type="hidden" value={organizacionId} />
      <input name="planClave" type="hidden" value={planClave} />
      <Field className="w-36">
        <FieldLabel>Periodicidad</FieldLabel>
        <Select defaultValue={periodicidadActual === "anual" ? "anual" : "mensual"} name="periodicidad">
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </Select>
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

  return (
    <form action={formAction} className="space-y-3">
      <input name="organizacionId" type="hidden" value={organizacionId} />
      <Field>
        <FieldLabel required>Motivo de la cancelación</FieldLabel>
        <Input maxLength={500} name="motivo" placeholder="Cuéntanos qué podríamos mejorar" required />
      </Field>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={isPending} size="sm" type="submit" variant="outline">
        {isPending ? "Registrando…" : "Solicitar cancelación"}
      </Button>
    </form>
  );
}
