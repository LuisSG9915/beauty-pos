"use client";

import { useActionState } from "react";

import { saveMembresia, type MembresiaActionState } from "@/app/admin/membresias/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export type MembresiaData = {
  id?: string;
  organizacionId: string;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  duracionDias: number;
  descuentoPorcentaje: string;
  aplica: string;
  precio: string;
};

export function MembresiaForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial?: MembresiaData;
}) {
  const [state, formAction, pending] = useActionState<MembresiaActionState, FormData>(saveMembresia, {});
  const value = (key: keyof MembresiaData) => initial?.[key] ?? "";

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar membresía" : "Nueva membresía"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Beneficio por tiempo: el cliente paga por adelantado y obtiene un descuento mientras la membresía esté vigente.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input defaultValue={String(value("clave"))} name="clave" placeholder="VIP30" required />
        </Field>
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={String(value("nombre"))} name="nombre" placeholder="Membresía VIP" required />
        </Field>
        <Field>
          <FieldLabel required>Precio de venta</FieldLabel>
          <Input defaultValue={String(value("precio"))} min="0" name="precio" placeholder="500.00" required step="0.01" type="number" />
        </Field>
        <Field>
          <FieldLabel required>Duración (días)</FieldLabel>
          <Input defaultValue={String(value("duracionDias") || "30")} min="1" name="duracionDias" required step="1" type="number" />
        </Field>
        <Field>
          <FieldLabel required>Descuento %</FieldLabel>
          <Input defaultValue={String(value("descuentoPorcentaje") || "10")} max="100" min="0" name="descuentoPorcentaje" required step="0.01" type="number" />
        </Field>
        <Field>
          <FieldLabel required>Aplica a</FieldLabel>
          <Select defaultValue={String(value("aplica") || "ambos")} name="aplica">
            <option value="ambos">Servicios y productos</option>
            <option value="servicio">Solo servicios</option>
            <option value="producto">Solo productos</option>
          </Select>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Descripción</FieldLabel>
          <Textarea defaultValue={String(value("descripcion"))} name="descripcion" />
        </Field>
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Membresía guardada correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar membresía"}
      </Button>
    </form>
  );
}
