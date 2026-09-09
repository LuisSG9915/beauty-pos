"use client";

import { useActionState } from "react";

import { acceptInvitation } from "@/app/invitacion/[token]/actions";
import { Button } from "@/components/ui/button";

export function AcceptInvitationForm({ token, email, name }: { token: string; email: string; name: string }) {
  const [state, formAction, isPending] = useActionState(acceptInvitation, {});

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input name="token" type="hidden" value={token} />
      <div className="rounded-xl bg-[#f8f5f2] px-4 py-3 text-sm text-[#74675f]">Invitación para <strong>{email}</strong></div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Nombre</span>
        <input className="h-11 w-full rounded-xl border border-[#e3d9d1] bg-white px-3 text-sm outline-none focus:border-[#b8795d]" defaultValue={name} name="nombre" required />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Contraseña</span>
        <input className="h-11 w-full rounded-xl border border-[#e3d9d1] bg-white px-3 text-sm outline-none focus:border-[#b8795d]" minLength={12} name="password" required type="password" />
      </label>
      {state.error ? <p className="rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a34e3b]" role="alert">{state.error}</p> : null}
      <Button className="h-11 w-full rounded-xl bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]" disabled={isPending} type="submit">
        {isPending ? "Creando acceso..." : "Aceptar invitación"}
      </Button>
    </form>
  );
}
