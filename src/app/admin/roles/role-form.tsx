"use client";

import { ShieldPlus } from "lucide-react";
import { useActionState } from "react";

import { createRole } from "@/app/admin/roles/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function RoleForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, isPending] = useActionState(createRole, {});
  return (
    <form action={formAction} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <Field>
        <FieldLabel required>Clave</FieldLabel>
        <Input name="clave" placeholder="ej. supervisor" required />
        <p className="mt-1 text-xs text-muted-foreground">Minúsculas, números y guion bajo.</p>
      </Field>
      <Field>
        <FieldLabel required>Nombre</FieldLabel>
        <Input name="nombre" placeholder="ej. Supervisor de piso" required />
      </Field>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="roles.rol.crear" disabled={isPending} type="submit">
        <ShieldPlus aria-hidden="true" className="size-4" />
        {isPending ? "Creando…" : "Crear rol"}
      </Button>
    </form>
  );
}
