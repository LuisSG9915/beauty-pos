"use client";

import { useActionState } from "react";

import { savePaymentMethod, type PaymentMethodActionState } from "@/app/admin/medios-pago/actions";
import { Button } from "@/components/ui/button";

type PaymentMethodData = { id: string; clave: string; nombre: string; categoria: string };

const CATEGORIA_DESC: Record<string, string> = {
  efectivo: "Se cuenta físicamente en caja. Admite cambio.",
  tarjeta: "Requiere referencia (terminal/procesador). Puede tener comisión.",
  transferencia: "Requiere referencia. Se reconcilia con el banco.",
  wallet: "Requiere referencia (Mercado Pago, Apple Pay, etc.).",
  otro: "Vales, gift cards u otros medios personalizados.",
};

export function PaymentMethodForm({ organizationId, initial }: { organizationId: string; initial?: PaymentMethodData }) {
  const [state, action, pending] = useActionState<PaymentMethodActionState, FormData>(savePaymentMethod, {});
  const categoria = (initial?.categoria ?? "efectivo") as "efectivo" | "tarjeta" | "transferencia" | "wallet" | "otro";
  return (
    <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar medio de pago" : "Nuevo medio de pago"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Define cómo se puede pagar en el POS: efectivo, tarjeta, transferencia, etc.</p>
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Clave *</span>
            <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm uppercase" defaultValue={initial?.clave} name="clave" placeholder="EFECTIVO" required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Nombre *</span>
            <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={initial?.nombre} name="nombre" placeholder="Efectivo" required />
          </label>
        </div>
        <label className="space-y-2">
          <span className="text-sm font-medium">Categoría *</span>
          <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={categoria} name="categoria">
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="wallet">Wallet digital</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">{CATEGORIA_DESC[categoria]}</p>
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Medio de pago guardado.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar medio de pago"}</Button>
    </form>
  );
}
