"use client";

import { useActionState } from "react";

import { savePaquete, type PaqueteActionState } from "@/app/admin/paquetes/actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export type PaqueteData = {
  id?: string;
  organizacionId: string;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  servicioId: string;
  sesiones: number;
  precio: string;
};

export function PaqueteForm({
  organizationId,
  serviciosItems,
  initial,
}: {
  organizationId: string;
  serviciosItems: Array<{ id: string; nombre: string; duracionMinutos: number }>;
  initial?: PaqueteData;
}) {
  const [state, formAction, pending] = useActionState<PaqueteActionState, FormData>(savePaquete, {});
  const value = (key: keyof PaqueteData) => initial?.[key] ?? "";

  return (
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar paquete" : "Nuevo paquete"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">
        Sesiones prepagadas de un servicio: el cliente paga por adelantado y consume una sesión por visita.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input defaultValue={String(value("clave"))} name="clave" placeholder="DEPILA5" required />
        </Field>
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={String(value("nombre"))} name="nombre" placeholder="Paquete 5 depilaciones" required />
        </Field>
        <Field className="sm:col-span-2">
          <Combobox
            defaultValue={initial?.servicioId ?? null}
            items={serviciosItems.map((s) => ({
              value: s.id,
              label: s.nombre,
              description: `${s.duracionMinutos} min`,
            }))}
            label="Servicio cubierto"
            name="servicioId"
            placeholder="Selecciona el servicio"
            required
          />
        </Field>
        <Field>
          <FieldLabel required>Sesiones incluidas</FieldLabel>
          <Input defaultValue={String(value("sesiones") || "5")} min="1" name="sesiones" required step="1" type="number" />
        </Field>
        <Field>
          <FieldLabel required>Precio del paquete</FieldLabel>
          <Input defaultValue={String(value("precio"))} min="0" name="precio" placeholder="800.00" required step="0.01" type="number" />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Descripción</FieldLabel>
          <Textarea defaultValue={String(value("descripcion"))} name="descripcion" />
        </Field>
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Paquete guardado correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar paquete"}
      </Button>
    </form>
  );
}
