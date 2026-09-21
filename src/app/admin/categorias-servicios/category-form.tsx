"use client";

import { useActionState } from "react";

import { saveServiceCategory, type CategoryActionState } from "@/app/admin/categorias-servicios/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function CategoryForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string; descripcion: string | null } }) {
  const [state, action, pending] = useActionState<CategoryActionState, FormData>(saveServiceCategory, {});
  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar categoría" : "Nueva categoría"}</h2>
      <div className="mt-5 space-y-4">
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input className="uppercase" defaultValue={initial?.clave} name="clave" placeholder="CABELLO" required />
        </Field>
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={initial?.nombre} name="nombre" placeholder="Cabello" required />
        </Field>
        <Field>
          <FieldLabel>Descripción</FieldLabel>
          <Textarea defaultValue={initial?.descripcion ?? ""} name="descripcion" />
        </Field>
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Categoría guardada." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar categoría"}</Button>
    </form>
  );
}
