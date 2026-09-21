"use client";

import { useActionState } from "react";

import { saveService, type ServiceActionState } from "@/app/admin/servicios/actions";
import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type ServiceData = { id?: string; organizacionId: string; categoriaId?: string | null; clave: string; nombre: string; descripcion?: string | null; duracionMinutos: number; precioBase: string; visibleAgenda: boolean; requiereCabina: boolean };

export function ServiceForm({ organizationId, categories, initial }: { organizationId: string; categories: Array<{ id: string; nombre: string }>; initial?: ServiceData }) {
  const [state, formAction, pending] = useActionState<ServiceActionState, FormData>(saveService, {});
  const value = (key: keyof ServiceData) => initial?.[key] ?? "";

  const general = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel required>Clave</FieldLabel>
        <Input defaultValue={String(value("clave"))} name="clave" placeholder="CORTE_DAMA" required />
      </Field>
      <Field>
        <FieldLabel>Categoría</FieldLabel>
        <Select defaultValue={String(value("categoriaId"))} name="categoriaId">
          <option value="">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.nombre}</option>
          ))}
        </Select>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel required>Nombre</FieldLabel>
        <Input defaultValue={String(value("nombre"))} name="nombre" placeholder="Corte de dama" required />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Descripción</FieldLabel>
        <Textarea defaultValue={String(value("descripcion"))} name="descripcion" />
      </Field>
    </div>
  );

  const operation = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel required>Duración en minutos</FieldLabel>
        <Input defaultValue={String(value("duracionMinutos") || 60)} min={5} name="duracionMinutos" required type="number" />
      </Field>
      <Field>
        <FieldLabel required>Precio base (MXN)</FieldLabel>
        <Input defaultValue={String(value("precioBase"))} min="0" name="precioBase" placeholder="350.00" required step="0.01" type="number" />
      </Field>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <input defaultChecked={initial ? initial.visibleAgenda : true} name="visibleAgenda" type="checkbox" value="true" /> Visible en agenda
      </label>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3 text-sm">
        <input defaultChecked={initial?.requiereCabina} name="requiereCabina" type="checkbox" value="true" /> Requiere cabina
      </label>
    </div>
  );

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar servicio" : "Nuevo servicio"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Organiza la información en secciones para mantener el formulario simple.</p>
      <div className="mt-5">
        <FormTabs
          tabs={[
            { id: "general", label: "General", content: general },
            { id: "operacion", label: "Precio y operación", content: operation },
            {
              id: "futuro",
              label: "Insumos y comisiones",
              content: (
                <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                  {initial ? "Los insumos y comisiones se gestionan en las secciones debajo de este formulario." : "Guarda el servicio primero para poder asignarle insumos y comisiones."}
                </p>
              ),
            },
          ]}
        />
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Servicio guardado correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar servicio"}</Button>
    </form>
  );
}
