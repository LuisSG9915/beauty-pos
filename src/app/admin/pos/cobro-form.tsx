"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { cobrarCita, type CobroActionState } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";

export function CobroForm({ organizacionId, citaId, mediosPago, requiereReferencia }: { organizationId: string; citaId: string; mediosPago: Array<{ id: string; nombre: string; categoria: string }>; requiereReferencia: boolean }) {
  const [state, action, pending] = useActionState<CobroActionState, FormData>(cobrarCita, {});
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => router.push(`/admin/agenda?organizationId=${organizationId}`), 1200);
      return () => clearTimeout(timer);
    }
  }, [state, organizationId, router]);

  return (
    <form action={action} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="citaId" type="hidden" value={citaId} />
      <h2 className="text-xl font-semibold">Cobrar cita</h2>
      <div className="mt-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Medio de pago *</span>
          <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" name="medioPagoId" required>
            <option value="">Selecciona medio de pago...</option>
            {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Referencia {requiereReferencia ? "*" : "(opcional)"}</span>
          <input className="h-10 w-full rounded-xl border border-[#ded8d2] px-3 text-sm" name="referencia" placeholder="Últimos 4 dígitos, folio de transferencia..." />
        </label>
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Venta registrada correctamente. Redirigiendo...</p> : null}
      <Button className="mt-6 rounded-xl bg-[#347052] text-white hover:bg-[#2a5a42]" disabled={pending} type="submit">{pending ? "Procesando..." : "Confirmar cobro"}</Button>
    </form>
  );
}
