"use client";

import { useActionState } from "react";

import { liquidarComisionesAction } from "@/app/admin/comisiones/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export type MedioPagoOpcion = { id: string; nombre: string; categoria: string };

const CATEGORIA_MEDIO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  wallet: "Wallet",
  otro: "Otro",
};

/**
 * Liquida todas las comisiones pendientes del profesional en el periodo
 * filtrado. <details> nativo: el pago es una acción deliberada, no un clic
 * accidental; el resumen queda visible al expandir.
 */
export function LiquidarForm({
  organizationId,
  sucursalId,
  usuarioId,
  periodoDesde,
  periodoHasta,
  medios,
}: {
  organizationId: string;
  sucursalId: string;
  usuarioId: string;
  periodoDesde: string;
  periodoHasta: string;
  medios: MedioPagoOpcion[];
}) {
  const [state, action, pending] = useActionState(liquidarComisionesAction, initialActionState);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-medium text-[#8a5140] hover:underline">
        Liquidar periodo
      </summary>
      <form action={action} className="mt-3 space-y-3 rounded-xl border border-[#eadfd8] bg-[#faf9f7] p-4">
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="sucursalId" type="hidden" value={sucursalId} />
        <input name="usuarioId" type="hidden" value={usuarioId} />
        <input name="periodoDesde" type="hidden" value={periodoDesde} />
        <input name="periodoHasta" type="hidden" value={periodoHasta} />
        <Field>
          <FieldLabel required>Medio de pago</FieldLabel>
          <Select name="medioPagoId" required>
            <option value="">Selecciona…</option>
            {medios.map((medio) => (
              <option key={medio.id} value={medio.id}>
                {medio.nombre} · {CATEGORIA_MEDIO_LABEL[medio.categoria] ?? medio.categoria}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>Notas</FieldLabel>
          <Input name="notas" placeholder="Opcional" />
        </Field>
        <ActionFeedback state={state} />
        <Button disabled={pending} size="sm" type="submit">
          {pending ? "Liquidando…" : "Confirmar pago de comisiones"}
        </Button>
      </form>
    </details>
  );
}
