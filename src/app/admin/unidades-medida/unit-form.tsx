"use client";

import { useActionState } from "react";

import { saveUnit, type UnitActionState } from "@/app/admin/unidades-medida/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function UnitForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string } }) {
  const [state, action, pending] = useActionState<UnitActionState, FormData>(saveUnit, {});
  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar unidad" : "Nueva unidad de medida"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Define cómo se cuenta el inventario: pieza, litro, gramo, mililitro, etc.</p>
      <div className="mt-5 space-y-4">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={initial?.nombre} name="nombre" placeholder="Pieza" required />
        </Field>
        {initial ? (
          <details className="rounded-xl border border-border bg-muted/60 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
              Opciones avanzadas
            </summary>
            <Field className="mt-3">
              <FieldLabel>Clave</FieldLabel>
              <Input name="clave" placeholder={initial.clave} />
              <FieldDescription>Déjala vacía para conservar la clave actual.</FieldDescription>
            </Field>
          </details>
        ) : null}
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Unidad guardada." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar unidad"}</Button>
    </form>
  );
}
