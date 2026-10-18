"use client";

import { MailPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { createInvitation } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type InvitationFormProps = {
  organizations: Array<{ id: string; nombre: string; slug: string }>;
  roles: Array<{ id: string; organizacionId: string | null; nombre: string }>;
  branches: Array<{ id: string; organizacionId: string; nombre: string; clave: string }>;
};

export function InvitationForm({ organizations, roles, branches }: InvitationFormProps) {
  const [state, formAction, isPending] = useActionState(createInvitation, {});
  const [organizationId, setOrganizationId] = useState("");
  const availableRoles = roles.filter((role) => role.organizacionId === organizationId);
  const availableBranches = branches.filter((branch) => branch.organizacionId === organizationId);

  return (
    <form action={formAction} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-primary">
          <MailPlus aria-hidden="true" className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Invitar miembro</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Asigna organización, sucursal y rol.</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <Field>
          <FieldLabel required>Organización</FieldLabel>
          <Select name="organizacionId" onChange={(event) => setOrganizationId(event.target.value)} required value={organizationId}>
            <option disabled value="">
              Selecciona una organización
            </option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.nombre} — {organization.slug}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel required>Rol</FieldLabel>
            <Select disabled={!organizationId} name="rolId" required>
              <option value="">{organizationId ? "Selecciona un rol" : "Primero selecciona organización"}</option>
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel required>Sucursal</FieldLabel>
            <Select
              defaultValue={availableBranches.length === 1 ? availableBranches[0].id : ""}
              disabled={!organizationId}
              name="sucursalId"
              required
            >
              <option value="">{organizationId ? "Selecciona una sucursal" : "Primero selecciona organización"}</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input name="nombre" placeholder="Nombre del miembro" required />
        </Field>
        <Field>
          <FieldLabel required>Correo</FieldLabel>
          <Input name="correo" placeholder="persona@salon.com" required type="email" />
        </Field>
      </div>

      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Invitación creada correctamente." />
      </div>
      {state.invitationUrl ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/60 p-4 text-sm">
          <p className="font-medium text-foreground">Enlace local de invitación</p>
          <a className="mt-2 block break-all text-primary underline" href={state.invitationUrl}>
            {state.invitationUrl}
          </a>
          <p className="mt-2 text-op-xs leading-5 text-muted-foreground">
            Este enlace solo se muestra en desarrollo porque no hay envío de correo habilitado.
          </p>
        </div>
      ) : null}

      <Button className="mt-6 rounded-xl" disabled={isPending} type="submit">
        <MailPlus aria-hidden="true" className="size-4" />
        {isPending ? "Enviando…" : "Enviar invitación"}
      </Button>
    </form>
  );
}
