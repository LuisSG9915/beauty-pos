"use client";

import { useActionState } from "react";

import { revertirLiquidacionAction } from "@/app/admin/comisiones/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

/** Reversión con motivo obligatorio; las líneas vuelven a pendientes. */
export function RevertirLiquidacionForm({
  organizationId,
  liquidacionId,
}: {
  organizationId: string;
  liquidacionId: string;
}) {
  const [state, action, pending] = useActionState(revertirLiquidacionAction, initialActionState);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-destructive hover:underline">
        Revertir
      </summary>
      <form action={action} className="mt-2 w-56 space-y-2 rounded-xl border border-border bg-muted/60 p-3">
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="liquidacionId" type="hidden" value={liquidacionId} />
        <Field>
          <FieldLabel required>Motivo</FieldLabel>
          <Input name="motivo" placeholder="Por qué se revierte el pago" required />
        </Field>
        <ActionFeedback state={state} />
        <Button disabled={pending} size="sm" type="submit" variant="destructive">
          {pending ? "Revirtiendo…" : "Confirmar reversión"}
        </Button>
      </form>
    </details>
  );
}
