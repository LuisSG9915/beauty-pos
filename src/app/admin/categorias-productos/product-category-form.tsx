"use client";

import { useActionState } from "react";

import { saveProductCategory, type ProductCategoryActionState } from "@/app/admin/categorias-productos/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function ProductCategoryForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string } }) {
  const [state, action, pending] = useActionState<ProductCategoryActionState, FormData>(saveProductCategory, {});
  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar categoría" : "Nueva categoría de producto"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Agrupa productos e insumos para facilitar su búsqueda y reportes.</p>
      <div className="mt-5 space-y-4">
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input className="uppercase" defaultValue={initial?.clave} name="clave" placeholder="CUIDADO_CABELLO" required />
        </Field>
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={initial?.nombre} name="nombre" placeholder="Cuidado del cabello" required />
        </Field>
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Categoría guardada." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar categoría"}</Button>
    </form>
  );
}
