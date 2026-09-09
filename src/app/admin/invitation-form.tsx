"use client";

import { MailPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { createInvitation } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

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
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#f8eee8] text-[#a76348]">
          <MailPlus className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Invitar miembro</h2>
          <p className="mt-1 text-sm leading-6 text-[#81746c]">Asigna organización, sucursal y rol.</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Organización</span>
          <select
            className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]"
            name="organizacionId"
            onChange={(event) => setOrganizationId(event.target.value)}
            required
            value={organizationId}
          >
            <option value="">Selecciona una organización</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.nombre} — {organization.slug}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Rol</span>
            <select className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" disabled={!organizationId} name="rolId" required>
              <option value="">{organizationId ? "Selecciona un rol" : "Primero selecciona organización"}</option>
              {availableRoles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Sucursal</span>
            <select className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" disabled={!organizationId} name="sucursalId" required>
              <option value="">{organizationId ? "Selecciona una sucursal" : "Primero selecciona organización"}</option>
              {availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre} ({branch.clave})</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Nombre</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" name="nombre" placeholder="Nombre del miembro" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Correo</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" name="correo" placeholder="persona@salon.com" required type="email" />
        </label>
      </div>

      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a34e3b]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#3d7b50]" role="status">Invitación creada correctamente.</p> : null}
      {state.invitationUrl ? (
        <div className="mt-4 rounded-xl border border-[#eadfd8] bg-[#fffaf5] p-4 text-sm">
          <p className="font-medium text-[#4b403a]">Enlace local de invitación</p>
          <a className="mt-2 block break-all text-[#a76348] underline" href={state.invitationUrl}>{state.invitationUrl}</a>
          <p className="mt-2 text-xs leading-5 text-[#81746c]">Este enlace solo se muestra en desarrollo porque no hay envío de correo habilitado.</p>
        </div>
      ) : null}

      <Button className="mt-6 rounded-xl bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]" disabled={isPending} type="submit">
        <MailPlus className="size-4" />
        {isPending ? "Enviando..." : "Enviar invitación"}
      </Button>
    </form>
  );
}
