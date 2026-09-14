"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

import { setRolePermissions, toggleRole } from "@/app/admin/roles/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";

type Permiso = { id: string; clave: string; nombre: string; modulo: string };
type Role = { id: string; clave: string; nombre: string; esSistema: boolean; activo: boolean };

export function RoleCard({
  role,
  permisos,
  permisosAsignables,
  permisoIds,
  memberCount,
  organizationId,
  canEdit,
}: {
  role: Role;
  permisos: Permiso[];
  /** IDs de permisos que el editor puede otorgar (los que él mismo tiene). */
  permisosAsignables: string[];
  permisoIds: string[];
  memberCount: number;
  organizationId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(setRolePermissions, {});
  const [toggleState, toggleAction, togglePending] = useActionState(toggleRole, {});
  const protegido = role.clave === "propietario";
  const editable = canEdit && !protegido;
  const asignables = new Set(permisosAsignables);
  const modulos = [...new Set(permisos.map((p) => p.modulo))];

  return (
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f1eeea] text-[#8a5140]">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[#2d2926]">
              {role.nombre}
              {role.esSistema ? <span className="ml-2 text-xs font-normal text-[#81746c]">sistema</span> : null}
            </p>
            <p className="truncate text-xs text-[#81746c]">
              {role.clave} · {permisoIds.length} permisos · {memberCount} miembro(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={role.activo ? "success" : "neutral"}>
            {role.activo ? "Activo" : "Inactivo"}
          </StatusBadge>
          <Button
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            size="sm"
            type="button"
            variant="outline"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            Permisos
          </Button>
          {canEdit && !protegido ? (
            <form action={toggleAction}>
              <input name="organizacionId" type="hidden" value={organizationId} />
              <input name="rolId" type="hidden" value={role.id} />
              <input name="activo" type="hidden" value={role.activo ? "false" : "true"} />
              <Button className="rounded-lg" disabled={togglePending} size="sm" type="submit" variant="outline">
                {role.activo ? "Desactivar" : "Activar"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {open ? (
        <form action={formAction} className="mt-4 space-y-4 border-t border-[#f1ece8] pt-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="rolId" type="hidden" value={role.id} />
          {modulos.map((modulo) => (
            <div key={modulo}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8795d]">{modulo}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {permisos
                  .filter((permiso) => permiso.modulo === modulo)
                  .map((permiso) => {
                    const asignable = asignables.has(permiso.id);
                    const marcado = permisoIds.includes(permiso.id);
                    return (
                      <label
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                          !editable || !asignable
                            ? "cursor-not-allowed border-[#eee8e3] bg-[#f7f4f1] text-[#a99d94]"
                            : "cursor-pointer border-[#ded8d2] bg-white text-[#625b55] hover:border-[#c9a899] has-checked:border-[#8a5140] has-checked:bg-[#f2e3dc] has-checked:text-[#60392e]"
                        }`}
                        key={permiso.id}
                        title={asignable ? permiso.clave : `${permiso.clave} — no tienes este permiso`}
                      >
                        <input
                          className="sr-only"
                          defaultChecked={marcado}
                          disabled={!editable || !asignable}
                          name="permisoIds"
                          type="checkbox"
                          value={permiso.id}
                        />
                        {permiso.nombre}
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}
          {editable ? (
            <div className="flex items-center gap-3">
              <Button disabled={isPending} size="sm" type="submit">
                {isPending ? "Guardando…" : "Guardar permisos"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-[#81746c]">
              {protegido ? "El rol Propietario tiene todos los permisos y no se puede modificar." : "Solo lectura."}
            </p>
          )}
          <ActionFeedback state={state} />
        </form>
      ) : null}
      <ActionFeedback state={toggleState} />
    </section>
  );
}
