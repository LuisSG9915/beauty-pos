"use client";

import { useActionState } from "react";

import { saveTax, type TaxActionState } from "@/app/admin/impuestos/actions";
import { Button } from "@/components/ui/button";

type TaxData = { id: string; clave: string; nombre: string; tasa: string; tipo: string };

const TIPO_LABEL: Record<string, string> = { agregado: "Agregado al precio", incluido: "Incluido en el precio", exento: "Exento" };

export function TaxForm({ organizationId, initial }: { organizationId: string; initial?: TaxData }) {
  const [state, action, pending] = useActionState<TaxActionState, FormData>(saveTax, {});
  const tipo = (initial?.tipo ?? "agregado") as "agregado" | "incluido" | "exento";
  return (
    <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar impuesto" : "Nuevo impuesto"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Configura IVA, IEPS u otros impuestos aplicables en el POS.</p>
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Clave *</span>
            <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm uppercase" defaultValue={initial?.clave} name="clave" placeholder="IVA" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Nombre *</span>
            <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={initial?.nombre} name="nombre" placeholder="IVA (16%)" required />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Tasa (%) *</span>
            <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={String(initial?.tasa ?? "16")} min="0" name="tasa" placeholder="16" required step="0.0001" type="number" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Tipo *</span>
            <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={tipo} name="tipo">
              <option value="agregado">Agregado al precio</option>
              <option value="incluido">Incluido en el precio</option>
              <option value="exento">Exento (0%)</option>
            </select>
          </label>
        </div>
        <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">
          {TIPO_LABEL[tipo]}: {tipo === "agregado" ? "el impuesto se suma al precio base en el ticket." : tipo === "incluido" ? "el precio ya contiene el impuesto y se desglosa en el ticket." : "no se aplica impuesto."}
        </p>
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Impuesto guardado.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar impuesto"}</Button>
    </form>
  );
}
