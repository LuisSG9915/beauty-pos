"use client";

import { useActionState } from "react";

import { savePromotion, type PromotionActionState } from "@/app/admin/promociones/actions";
import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type PromotionData = {
  id?: string;
  organizacionId: string;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  valor: string;
  aplica: string;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
};

export function PromotionForm({ organizationId, initial }: { organizationId: string; initial?: PromotionData }) {
  const [state, formAction, pending] = useActionState<PromotionActionState, FormData>(savePromotion, {});
  const value = (key: keyof PromotionData) => initial?.[key] ?? "";
  const tipo = (initial?.tipo ?? "porcentaje") as "porcentaje" | "monto" | "2x1" | "paquete";
  const aplica = (initial?.aplica ?? "ambos") as "producto" | "servicio" | "ambos";

  const reglas = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel required>Nombre</FieldLabel>
        <Input defaultValue={String(value("nombre"))} name="nombre" placeholder="Descuento del 10%" required />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Descripción</FieldLabel>
        <Textarea defaultValue={String(value("descripcion"))} name="descripcion" />
      </Field>
      <Field>
        <FieldLabel required>Tipo de promoción</FieldLabel>
        <Select defaultValue={tipo} name="tipo">
          <option value="porcentaje">Porcentaje de descuento</option>
          <option value="monto">Monto fijo de descuento</option>
          <option value="2x1">2x1</option>
          <option value="paquete">Paquete (precio especial)</option>
        </Select>
      </Field>
      <Field>
        <FieldLabel required>Valor</FieldLabel>
        <Input defaultValue={String(value("valor") || "0")} min="0" name="valor" placeholder="10" required step="0.001" type="number" />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel required>Aplica a</FieldLabel>
        <Select defaultValue={aplica} name="aplica">
          <option value="ambos">Productos y servicios</option>
          <option value="producto">Solo productos</option>
          <option value="servicio">Solo servicios</option>
        </Select>
      </Field>
      {initial ? (
        <details className="rounded-xl border border-border bg-muted/60 px-4 py-3 sm:col-span-2">
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
  );

  const vigencia = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel required>Vigencia desde</FieldLabel>
        <Input defaultValue={String(value("vigenciaDesde"))} name="vigenciaDesde" required type="date" />
      </Field>
      <Field>
        <FieldLabel>Vigencia hasta</FieldLabel>
        <Input defaultValue={String(value("vigenciaHasta"))} name="vigenciaHasta" type="date" />
      </Field>
      <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground sm:col-span-2">
        Si no indicas fecha de fin, la promoción queda vigente hasta que la ocultes manualmente.
      </p>
    </div>
  );

  const futuro = (
    <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
      La selección de productos, servicios, sucursales y restricciones específicas se habilitará al conectar el cobro y la agenda.
    </p>
  );

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar promoción" : "Nueva promoción"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Configura descuentos, 2x1 o paquetes para productos y servicios.</p>
      <div className="mt-5">
        <FormTabs
          tabs={[
            { id: "reglas", label: "Reglas", content: reglas },
            { id: "vigencia", label: "Vigencia", content: vigencia },
            { id: "futuro", label: "Productos y sucursales", content: futuro },
          ]}
        />
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Promoción guardada correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar promoción"}</Button>
    </form>
  );
}
