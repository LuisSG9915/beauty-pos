"use client";

import { useActionState } from "react";

import { toggleSucursalAction } from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

/** Activa/desactiva una sucursal sin borrar su historial. */
export function SucursalToggleForm({
  organizationId,
  sucursalId,
  activo,
}: {
  organizationId: string;
  sucursalId: string;
  activo: boolean;
}) {
  const [state, action, pending] = useActionState(toggleSucursalAction, initialActionState);

  return (
    <form action={action}>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <input name="activo" type="hidden" value={String(!activo)} />
      <Button className="rounded-xl" disabled={pending} type="submit" variant={activo ? "outline" : "default"}>
        {pending ? "Aplicando…" : activo ? "Desactivar" : "Activar"}
      </Button>
      <ActionFeedback state={state} />
    </form>
  );
}
