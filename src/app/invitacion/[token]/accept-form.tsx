"use client";

import { useActionState } from "react";

import { acceptInvitation } from "@/app/invitacion/[token]/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";

export function AcceptInvitationForm({ token, email, name }: { token: string; email: string; name: string }) {
  const [state, formAction, isPending] = useActionState(acceptInvitation, {});

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input name="token" type="hidden" value={token} />
      <div className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Invitación para <strong>{email}</strong></div>
      <Field>
        <FieldLabel required>Nombre</FieldLabel>
        <Input defaultValue={name} name="nombre" required />
      </Field>
      <Field>
        <FieldLabel required>Contraseña</FieldLabel>
        <Input minLength={12} name="password" required type="password" />
      </Field>
      {state.error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{state.error}</p> : null}
      <Button className="h-11 w-full rounded-xl" disabled={isPending} type="submit">
        {isPending ? "Creando acceso…" : "Aceptar invitación"}
      </Button>
    </form>
  );
}
