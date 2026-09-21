"use client";

import { useActionState } from "react";

import { setSucursalUsuariosAction } from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export type MiembroAsignable = {
  usuarioId: string;
  nombre: string;
  correo: string | null;
  /** true cuando el miembro tiene asignación explícita a esta sucursal. */
  asignado: boolean;
  /** true cuando el miembro no tiene asignaciones a NINGUNA sucursal → ve todas. */
  sinRestriccion: boolean;
};

/**
 * Checkboxes de miembros con acceso explícito a la sucursal. Los miembros sin
 * restricción (sin asignaciones a ninguna sucursal) ven todas — se marcan con
 * una nota porque quitarles la última asignación ampliaría su alcance.
 */
export function SucursalAsignacionForm({
  organizationId,
  sucursalId,
  miembros,
}: {
  organizationId: string;
  sucursalId: string;
  miembros: MiembroAsignable[];
}) {
  const [state, action, pending] = useActionState(setSucursalUsuariosAction, initialActionState);

  return (
    <form action={action} className="space-y-3">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {miembros.map((miembro) => (
          <label className="flex items-start gap-2 rounded-xl border border-[#eee8e3] px-3 py-2.5 text-sm" key={miembro.usuarioId}>
            <input
              className="mt-0.5"
              defaultChecked={miembro.asignado}
              disabled={miembro.sinRestriccion}
              name="usuarioIds"
              type="checkbox"
              value={miembro.usuarioId}
            />
            <span>
              <span className="block font-medium text-[#2d2926]">{miembro.nombre}</span>
              <span className="block text-xs text-[#6e6159]">
                {miembro.sinRestriccion ? "Sin restricción: ve todas las sucursales" : (miembro.correo ?? "")}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-[#6e6159]">
        Marca quién puede operar esta sucursal. Un miembro sin ninguna asignación en el negocio ve todas las
        sucursales; quitarle la última ampliaría su acceso.
      </p>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={pending} type="submit" variant="outline">
        {pending ? "Guardando…" : "Guardar asignación"}
      </Button>
    </form>
  );
}
