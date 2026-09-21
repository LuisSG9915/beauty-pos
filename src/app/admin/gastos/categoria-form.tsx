"use client";

import { useActionState } from "react";

import { crearCategoriaGastoAction } from "@/app/admin/gastos/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export function CategoriaGastoForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(crearCategoriaGastoAction, initialActionState);

  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="font-semibold text-foreground">Nueva categoría</h2>
      <p className="mt-1 text-sm text-muted-foreground">Renta, insumos, sueldos, mantenimiento…</p>
      <Field className="mt-4">
        <FieldLabel required>Nombre</FieldLabel>
        <Input name="nombre" placeholder="Nombre de la categoría" required />
      </Field>
      <div className="mt-3">
        <ActionFeedback state={state} />
      </div>
      <Button className="mt-4 rounded-xl" disabled={pending} type="submit" variant="outline">
        {pending ? "Creando…" : "Crear categoría"}
      </Button>
    </form>
  );
}
