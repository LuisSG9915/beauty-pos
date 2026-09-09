"use client";

import { useActionState } from "react";

import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { savePromotion, type PromotionActionState } from "@/app/admin/promociones/actions";

type PromotionData = {
  id?: string;
  organizacionId: string;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  valor: string;
  aplica: string;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
};

export function PromotionForm({ organizationId, initial }: { organizationId: string; initial?: PromotionData }) {
  const [state, formAction, pending] = useActionState<PromotionActionState, FormData>(savePromotion, {});
  const value = (key: keyof PromotionData) => initial?.[key] ?? "";
  const tipo = (initial?.tipo ?? "porcentaje") as "porcentaje" | "monto" | "2x1" | "paquete";
  const aplica = (initial?.aplica ?? "ambos") as "producto" | "servicio" | "ambos";

  const reglas = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">Clave *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("clave"))} name="clave" placeholder="DESC10" required />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Nombre *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("nombre"))} name="nombre" placeholder="Descuento del 10%" required />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Descripción</span>
        <textarea className="min-h-24 w-full rounded-xl border border-[#ded8d2] bg-white px-3 py-2 text-sm" defaultValue={String(value("descripcion"))} name="descripcion" />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Tipo de promoción *</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={tipo} name="tipo">
          <option value="porcentaje">Porcentaje de descuento</option>
          <option value="monto">Monto fijo de descuento</option>
          <option value="2x1">2x1</option>
          <option value="paquete">Paquete (precio especial)</option>
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Valor *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("valor") || "0")} min="0" name="valor" placeholder="10" required step="0.001" type="number" />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Aplica a *</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={aplica} name="aplica">
          <option value="ambos">Productos y servicios</option>
          <option value="producto">Solo productos</option>
          <option value="servicio">Solo servicios</option>
        </select>
      </label>
    </div>
  );

  const vigencia = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">Vigencia desde *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("vigenciaDesde"))} name="vigenciaDesde" required type="date" />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Vigencia hasta</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("vigenciaHasta"))} name="vigenciaHasta" type="date" />
      </label>
      <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55] sm:col-span-2">
        Si no indicas fecha de fin, la promoción queda vigente hasta que la ocultes manualmente.
      </p>
    </div>
  );

  const futuro = (
    <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">
      La selección de productos, servicios, sucursales y restricciones específicas se habilitará al conectar el POS y la agenda.
    </p>
  );

  return (
    <form action={formAction} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar promoción" : "Nueva promoción"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Configura descuentos, 2x1 o paquetes para productos y servicios.</p>
      <div className="mt-5">
        <FormTabs
          tabs={[
            { id: "reglas", label: "Reglas", content: reglas },
            { id: "vigencia", label: "Vigencia", content: vigencia },
            { id: "futuro", label: "Productos y sucursales", content: futuro },
          ]}
        />
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Promoción guardada correctamente.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar promoción"}</Button>
    </form>
  );
}
