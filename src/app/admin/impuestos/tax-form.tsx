"use client";

import { useActionState } from "react";

import { saveTax, type TaxActionState } from "@/app/admin/impuestos/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type TaxData = { id: string; clave: string; nombre: string; tasa: string; tipo: string };

const TIPO_LABEL: Record<string, string> = { agregado: "Agregado al precio", incluido: "Incluido en el precio", exento: "Exento" };

export function TaxForm({ organizationId, initial }: { organizationId: string; initial?: TaxData }) {
  const [state, action, pending] = useActionState<TaxActionState, FormData>(saveTax, {});
  const tipo = (initial?.tipo ?? "agregado") as "agregado" | "incluido" | "exento";
  return (
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar impuesto" : "Nuevo impuesto"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Configura IVA, IEPS u otros impuestos aplicables en el POS.</p>
      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel required>Nombre</FieldLabel>
            <Input defaultValue={initial?.nombre} name="nombre" placeholder="IVA (16%)" required />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel required>Tasa (%)</FieldLabel>
            <Input defaultValue={String(initial?.tasa ?? "16")} min="0" name="tasa" placeholder="16" required step="0.0001" type="number" />
          </Field>
          <Field>
            <FieldLabel required>Tipo</FieldLabel>
            <Select defaultValue={tipo} name="tipo">
              <option value="agregado">Agregado al precio</option>
              <option value="incluido">Incluido en el precio</option>
              <option value="exento">Exento (0%)</option>
            </Select>
          </Field>
        </div>
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          {TIPO_LABEL[tipo]}: {tipo === "agregado" ? "el impuesto se suma al precio base en el ticket." : tipo === "incluido" ? "el precio ya contiene el impuesto y se desglosa en el ticket." : "no se aplica impuesto."}
        </p>
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
        <ActionFeedback state={state} successMessage="Impuesto guardado." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar impuesto"}</Button>
    </form>
  );
}
