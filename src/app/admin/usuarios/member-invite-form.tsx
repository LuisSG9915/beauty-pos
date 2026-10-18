"use client";

import { MailPlus } from "lucide-react";
import { useActionState } from "react";

import { inviteMember } from "@/app/admin/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export function MemberInviteForm({
  organizationId,
  roles,
  branches,
}: {
  organizationId: string;
  roles: Array<{ id: string; nombre: string }>;
  branches: Array<{ id: string; nombre: string }>;
}) {
  const [state, formAction, isPending] = useActionState(inviteMember, {});
  const invitationUrl = state.data?.invitationUrl;

  return (
    <form action={formAction} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input name="nombre" placeholder="Nombre del miembro" required />
        </Field>
        <Field>
          <FieldLabel required>Correo</FieldLabel>
          <Input name="correo" placeholder="persona@salon.com" required type="email" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Rol</FieldLabel>
          <Select name="rolId" required>
            <option value="">Selecciona un rol</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel required>Sucursal</FieldLabel>
          <Select defaultValue={branches.length === 1 ? branches[0].id : ""} name="sucursalId" required>
            {branches.length > 1 ? <option value="">Selecciona una sucursal</option> : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ActionFeedback state={state} />
      {invitationUrl ? (
        <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm">
          <p className="font-medium text-foreground">Enlace local de invitación</p>
          <a className="mt-2 block break-all text-primary underline" href={invitationUrl}>
            {invitationUrl}
          </a>
          <p className="mt-2 text-op-xs leading-5 text-muted-foreground">
            Este enlace solo se muestra en desarrollo porque no hay envío de correo habilitado.
          </p>
        </div>
      ) : null}
      <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="usuarios.invitacion.enviar" disabled={isPending} type="submit">
        <MailPlus aria-hidden="true" className="size-4" />
        {isPending ? "Enviando…" : "Enviar invitación"}
      </Button>
    </form>
  );
}
