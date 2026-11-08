"use client";

import { Building2, Plus } from "lucide-react";
import { useActionState } from "react";

import { createOrganization } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function OrganizationForm() {
  const [state, formAction, isPending] = useActionState(createOrganization, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-primary">
          <Building2 aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Crear organización</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Registra el negocio y su primera sucursal.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel required>Nombre del negocio</FieldLabel>
          <Input invalid={Boolean(fe.nombre)} name="nombre" placeholder="Casa Magnolia" required />
          <FieldError error={fe.nombre} />
        </Field>
        <Field>
          <FieldLabel required>Identificador</FieldLabel>
          <Input invalid={Boolean(fe.slug)} name="slug" placeholder="casa-magnolia" required />
          <FieldError error={fe.slug} />
        </Field>
        <Field>
          <FieldLabel required>Nombre de la primera sucursal</FieldLabel>
          <Input invalid={Boolean(fe.sucursalNombre)} name="sucursalNombre" placeholder="Salón Roma Norte" required />
          <FieldError error={fe.sucursalNombre} />
        </Field>
        <Field>
          <FieldLabel>Clave de sucursal</FieldLabel>
          <Input className="uppercase" invalid={Boolean(fe.sucursalClave)} name="sucursalClave" placeholder="Se genera del nombre si la dejas vacía" />
          <FieldError error={fe.sucursalClave} />
        </Field>
      </div>

      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Organización creada correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="plataforma.organizacion.crear" disabled={isPending} type="submit">
        <Plus aria-hidden="true" className="size-4" />
        {isPending ? "Creando…" : "Crear organización"}
      </Button>
    </form>
  );
}
