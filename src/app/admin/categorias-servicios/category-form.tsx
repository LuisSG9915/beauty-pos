"use client";

import { useActionState } from "react";

import { saveServiceCategory, type CategoryActionState } from "@/app/admin/categorias-servicios/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function CategoryForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string; descripcion: string | null } }) {
  const [state, action, pending] = useActionState<CategoryActionState, FormData>(saveServiceCategory, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar categoría" : "Nueva categoría"}</h2>
      <div className="mt-5 space-y-4">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={initial?.nombre} invalid={Boolean(fe.nombre)} name="nombre" placeholder="Cabello" required />
          <FieldError error={fe.nombre} />
        </Field>
        <Field>
          <FieldLabel>Descripción</FieldLabel>
          <Textarea defaultValue={initial?.descripcion ?? ""} invalid={Boolean(fe.descripcion)} name="descripcion" />
          <FieldError error={fe.descripcion} />
        </Field>
        {initial ? (
          <details className="rounded-xl border border-border bg-muted/60 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
              Opciones avanzadas
            </summary>
            <Field className="mt-3">
              <FieldLabel>Clave</FieldLabel>
              <Input invalid={Boolean(fe.clave)} name="clave" placeholder={initial.clave} />
              <FieldError error={fe.clave} />
              <FieldDescription>Déjala vacía para conservar la clave actual.</FieldDescription>
            </Field>
          </details>
        ) : null}
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Categoría guardada." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="catalogo.categorias_servicios.guardar" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar categoría"}</Button>
    </form>
  );
}
