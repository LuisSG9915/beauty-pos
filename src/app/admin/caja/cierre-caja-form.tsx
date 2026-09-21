"use client";

import { useActionState, useRef } from "react";

import { cerrarCaja, type CajaActionState } from "@/app/admin/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

const initialState: CajaActionState = {};

type MedioPago = { id: string; nombre: string; categoria: string };

/**
 * Conteo ciego: muestra un input por medio de pago sin revelar lo que el
 * sistema espera. Las diferencias se calculan en el servidor al confirmar.
 */
export function CierreCajaForm({
  corteId,
  medios,
  organizationId,
}: {
  corteId: string;
  medios: MedioPago[];
  organizationId: string;
}) {
  const [state, formAction, pending] = useActionState(cerrarCaja, initialState);
  const conteosRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={() => {
        const data = new FormData(formRef.current ?? undefined);
        const conteos: Record<string, number> = {};
        for (const medio of medios) {
          conteos[medio.id] = Number(data.get(`contado_${medio.id}`) ?? 0) || 0;
        }
        if (conteosRef.current) conteosRef.current.value = JSON.stringify(conteos);
      }}
      ref={formRef}
    >
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="corteId" type="hidden" value={corteId} />
      <input name="conteos" ref={conteosRef} type="hidden" value="{}" />

      <p className="rounded-xl bg-[#fdf3e8] px-4 py-3 text-sm font-medium text-[#986b16]">
        Cuenta el efectivo y los vouchers de cada medio sin consultar el sistema. Las diferencias se calculan al confirmar.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {medios.map((medio) => (
          <Field key={medio.id}>
            <FieldLabel required>{medio.nombre}</FieldLabel>
            <Input
              inputMode="decimal"
              min="0"
              name={`contado_${medio.id}`}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
            />
          </Field>
        ))}
      </div>

      <Field>
        <FieldLabel>Notas del cierre</FieldLabel>
        <Textarea name="notas" placeholder="Aclaraciones, incidencias del turno" rows={2} />
      </Field>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" data-action-id="caja.cierre.confirmar" disabled={pending} size="touch" type="submit">
        {pending ? "Cerrando…" : "Confirmar cierre de caja"}
      </Button>
    </form>
  );
}
