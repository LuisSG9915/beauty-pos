"use client";

import { ShieldPlus } from "lucide-react";
import { useActionState } from "react";

import { createRole } from "@/app/admin/roles/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { fieldError } from "@/lib/action-state";

export function RoleForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, isPending] = useActionState(createRole, {});
  const fe = (name: string) => fieldError(state, name);
  return (
    <form action={formAction} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <Field>
        <FieldLabel required>Nombre del rol</FieldLabel>
        <Input invalid={Boolean(fe("nombre"))} name="nombre" placeholder="ej. Supervisor de piso, Recepción turno tarde" required />
        <FieldError error={fe("nombre")} />
      </Field>
      <details className="rounded-xl border border-border bg-muted/40 px-4 py-3">
        <summary className="cursor-pointer list-none text-op-xs font-medium text-muted-foreground hover:text-primary">
          Opciones avanzadas
        </summary>
        <div className="mt-3">
          <Field>
            <FieldLabel>Clave interna (opcional)</FieldLabel>
            <Input invalid={Boolean(fe("clave"))} name="clave" placeholder="Se genera automáticamente" />
            <FieldError error={fe("clave")} />
            <p className="mt-1 text-op-xs text-muted-foreground">Déjala vacía para que el sistema la genere a partir del nombre.</p>
          </Field>
        </div>
      </details>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="roles.rol.crear" disabled={isPending} type="submit">
        <ShieldPlus aria-hidden="true" className="size-4" />
        {isPending ? "Creando…" : "Crear rol"}
      </Button>
    </form>
  );
}
