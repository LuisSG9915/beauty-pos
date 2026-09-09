"use client";

import { useActionState } from "react";

import { saveUnit, type UnitActionState } from "@/app/admin/unidades-medida/actions";
import { Button } from "@/components/ui/button";

export function UnitForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string } }) {
  const [state, action, pending] = useActionState<UnitActionState, FormData>(saveUnit, {});
  return (
    <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar unidad" : "Nueva unidad de medida"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Define cómo se cuenta el inventario: pieza, litro, gramo, mililitro, etc.</p>
      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Clave *</span>
          <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm uppercase" defaultValue={initial?.clave} name="clave" placeholder="PZA" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Nombre *</span>
          <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={initial?.nombre} name="nombre" placeholder="Pieza" required />
        </label>
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Unidad guardada.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar unidad"}</Button>
    </form>
  );
}
