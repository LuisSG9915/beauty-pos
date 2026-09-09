"use client";

import { useActionState } from "react";

import { saveServiceCategory, type CategoryActionState } from "@/app/admin/categorias-servicios/actions";
import { Button } from "@/components/ui/button";

export function CategoryForm({ organizationId, initial }: { organizationId: string; initial?: { id: string; clave: string; nombre: string; descripcion: string | null } }) {
  const [state, action, pending] = useActionState<CategoryActionState, FormData>(saveServiceCategory, {});
  return <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm"><input name="id" type="hidden" value={initial?.id ?? ""} /><input name="organizacionId" type="hidden" value={organizationId} /><h2 className="text-xl font-semibold">{initial ? "Editar categoría" : "Nueva categoría"}</h2><div className="mt-5 space-y-4"><label className="block space-y-2"><span className="text-sm font-medium">Clave *</span><input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm uppercase" defaultValue={initial?.clave} name="clave" placeholder="CABELLO" required /></label><label className="block space-y-2"><span className="text-sm font-medium">Nombre *</span><input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={initial?.nombre} name="nombre" placeholder="Cabello" required /></label><label className="block space-y-2"><span className="text-sm font-medium">Descripción</span><textarea className="min-h-24 w-full rounded-xl border border-[#ded8d2] px-3 py-2 text-sm" defaultValue={initial?.descripcion ?? ""} name="descripcion" /></label></div>{state.error ? <p className="mt-4 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}{state.success ? <p className="mt-4 text-sm text-[#347052]" role="status">Categoría guardada.</p> : null}<Button className="mt-6 rounded-xl bg-[#8a5140] text-white" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar categoría"}</Button></form>;
}
