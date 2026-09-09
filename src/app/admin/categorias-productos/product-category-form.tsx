"use client";

import { useActionState } from "react";

import { saveProductCategory, type ProductCategoryActionState } from "@/app/admin/categorias-productos/actions";
import { Button } from "@/components/ui/button";

export function ProductCategoryForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string } }) {
  const [state, action, pending] = useActionState<ProductCategoryActionState, FormData>(saveProductCategory, {});
  return (
    <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar categoría" : "Nueva categoría de producto"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Agrupa productos e insumos para facilitar su búsqueda y reportes.</p>
      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Clave *</span>
          <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm uppercase" defaultValue={initial?.clave} name="clave" placeholder="CUIDADO_CABELLO" required />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Nombre *</span>
          <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={initial?.nombre} name="nombre" placeholder="Cuidado del cabello" required />
        </label>
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Categoría guardada.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar categoría"}</Button>
    </form>
  );
}
