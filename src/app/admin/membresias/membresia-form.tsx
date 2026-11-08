"use client";

import { useActionState } from "react";

import { saveMembresia, type MembresiaActionState } from "@/app/admin/membresias/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
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
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar membresía" : "Nueva membresía"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Beneficio por tiempo: el cliente paga por adelantado y obtiene un descuento mientras la membresía esté vigente.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={String(value("nombre"))} invalid={Boolean(fe.nombre)} name="nombre" placeholder="Membresía VIP" required />
          <FieldError error={fe.nombre} />
        </Field>
        <Field>
          <FieldLabel required>Precio de venta</FieldLabel>
          <Input defaultValue={String(value("precio"))} invalid={Boolean(fe.precio)} min="0" name="precio" placeholder="500.00" required step="0.01" type="number" />
          <FieldError error={fe.precio} />
        </Field>
        <Field>
          <FieldLabel required>Duración (días)</FieldLabel>
          <Input defaultValue={String(value("duracionDias") || "30")} invalid={Boolean(fe.duracionDias)} min="1" name="duracionDias" required step="1" type="number" />
          <FieldError error={fe.duracionDias} />
        </Field>
        <Field>
          <FieldLabel required>Descuento %</FieldLabel>
          <Input defaultValue={String(value("descuentoPorcentaje") || "10")} invalid={Boolean(fe.descuentoPorcentaje)} max="100" min="0" name="descuentoPorcentaje" required step="0.01" type="number" />
          <FieldError error={fe.descuentoPorcentaje} />
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
          <Textarea defaultValue={String(value("descripcion"))} invalid={Boolean(fe.descripcion)} name="descripcion" />
          <FieldError error={fe.descripcion} />
        </Field>
        {initial ? (
          <details className="rounded-xl border border-border bg-muted/60 px-4 py-3 sm:col-span-2">
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
        <ActionFeedback state={state} successMessage="Membresía guardada correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="catalogo.membresias.guardar" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar membresía"}
      </Button>
    </form>
  );
}
