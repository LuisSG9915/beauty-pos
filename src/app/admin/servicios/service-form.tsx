"use client";

import { useActionState } from "react";

import { saveService, type ServiceActionState } from "@/app/admin/servicios/actions";
import { ProductImageField } from "@/components/media-image-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type ServiceData = { id?: string; organizacionId: string; categoriaId?: string | null; clave: string; nombre: string; descripcion?: string | null; duracionMinutos: number; precioBase: string; visibleAgenda: boolean; requiereCabina: boolean; /** Llave R2 de la foto principal (null si aún no tiene). */ imagenClaveR2?: string | null };

export function ServiceForm({ organizationId, categories, initial }: { organizationId: string; categories: Array<{ id: string; nombre: string }>; initial?: ServiceData }) {
  const [state, formAction, pending] = useActionState<ServiceActionState, FormData>(saveService, {});
  const value = (key: keyof ServiceData) => initial?.[key] ?? "";

  // "Más opciones" arranca abierto solo cuando la edición ya trae datos no
  // básicos, para que el usuario vea lo que había llenado antes.
  const tieneAvanzadas = Boolean(
    initial && (initial.descripcion || !initial.visibleAgenda || initial.requiereCabina),
  );

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar servicio" : "Nuevo servicio"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {initial
          ? "Ajusta los datos del servicio."
          : "Con nombre, duración y precio basta para agendarlo; el resto queda en Más opciones."}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={String(value("nombre"))} name="nombre" placeholder="Corte de dama" required />
        </Field>
        <Field>
          <FieldLabel required>Duración en minutos</FieldLabel>
          <Input defaultValue={String(value("duracionMinutos") || 60)} min={5} name="duracionMinutos" required type="number" />
        </Field>
        <Field>
          <FieldLabel required>Precio base (MXN)</FieldLabel>
          <Input defaultValue={String(value("precioBase"))} min="0" name="precioBase" placeholder="350.00" required step="0.01" type="number" />
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
          <FieldLabel>Foto</FieldLabel>
          {initial?.id ? (
            <ProductImageField
              claveInicial={initial.imagenClaveR2}
              entidad="servicio"
              entidadId={initial.id}
              organizacionId={organizationId}
            />
          ) : (
            <FieldDescription>
              Guarda el servicio primero; después podrás tomarle una foto desde Editar.
            </FieldDescription>
          )}
          {initial?.id ? (
            <FieldDescription>Aparece al agendar una cita y en el punto de venta.</FieldDescription>
          ) : null}
        </Field>
      </div>

      <details className="mt-5 rounded-xl border border-border bg-muted/60 px-4 py-3" open={tieneAvanzadas}>
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
          Más opciones
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel>Descripción</FieldLabel>
            <Textarea defaultValue={String(value("descripcion"))} name="descripcion" />
          </Field>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <input defaultChecked={initial ? initial.visibleAgenda : true} name="visibleAgenda" type="checkbox" value="true" /> Visible en agenda
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <input defaultChecked={initial?.requiereCabina} name="requiereCabina" type="checkbox" value="true" /> Requiere cabina
          </label>
          {initial ? (
            <Field className="sm:col-span-2">
              <FieldLabel>Clave</FieldLabel>
              <Input name="clave" placeholder={initial.clave} />
              <FieldDescription>Déjala vacía para conservar la clave actual.</FieldDescription>
            </Field>
          ) : null}
        </div>
      </details>

      {!initial ? (
        <p className="mt-4 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Después de guardar podrás asignarle insumos y comisiones editándolo desde la lista.
        </p>
      ) : null}

      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Servicio guardado correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="catalogo.servicios.guardar" disabled={pending} size="lg" type="submit">
        {pending ? "Guardando…" : "Guardar servicio"}
      </Button>
    </form>
  );
}
