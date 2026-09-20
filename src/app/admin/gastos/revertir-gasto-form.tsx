"use client";

import { useActionState } from "react";

import { revertirGastoAction } from "@/app/admin/gastos/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

/**
 * Reversión con motivo obligatorio. Usa <details> nativo: funciona sin
 * depender de un modal y el formulario conserva su estado.
 */
export function RevertirGastoForm({
  organizationId,
  gastoId,
  concepto,
}: {
  organizationId: string;
  gastoId: string;
  concepto: string;
}) {
  const [state, action, pending] = useActionState(revertirGastoAction, initialActionState);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-[#a8443a] hover:underline">
        Revertir
      </summary>
      <form action={action} className="mt-2 w-56 space-y-2 rounded-xl border border-[#eadfd8] bg-[#faf9f7] p-3">
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="gastoId" type="hidden" value={gastoId} />
        <Field>
          <FieldLabel required>Motivo</FieldLabel>
          <Input name="motivo" placeholder={`Por qué se revierte «${concepto}»`} required />
        </Field>
        <ActionFeedback state={state} />
        <Button disabled={pending} size="sm" type="submit" variant="destructive">
          {pending ? "Revirtiendo…" : "Confirmar reversión"}
        </Button>
      </form>
    </details>
  );
}
