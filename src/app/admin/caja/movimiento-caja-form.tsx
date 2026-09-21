"use client";

import { useActionState, useState } from "react";

import { registrarMovimientoCaja } from "@/app/admin/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";

type MedioPago = { id: string; nombre: string };

const TIPOS: Array<{ value: string; label: string; salida: boolean }> = [
  { value: "entrada", label: "Entrada (dinero que entra sin venta)", salida: false },
  { value: "retiro", label: "Retiro (dueño / banco)", salida: true },
  { value: "gasto", label: "Gasto (pago en efectivo)", salida: true },
  { value: "deposito", label: "Depósito a banco", salida: true },
  { value: "ajuste", label: "Ajuste (admite negativo)", salida: false },
];

/** Registro de movimientos manuales del turno sobre el corte abierto. */
export function MovimientoCajaForm({
  mediosEfectivo,
  organizationId,
  sucursalId,
}: {
  mediosEfectivo: MedioPago[];
  organizationId: string;
  sucursalId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    registrarMovimientoCaja,
    initialActionState,
  );
  const [tipo, setTipo] = useState("entrada");
  const notaRequerida = tipo !== "entrada";

  if (mediosEfectivo.length === 0) {
    return (
      <p className="rounded-xl bg-[#fbf4e2] px-4 py-3 text-sm text-[#986b16]">
        Configura un medio de pago en efectivo para registrar movimientos.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
        <Field>
          <FieldLabel className="text-xs">Tipo</FieldLabel>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            name="tipo"
            onChange={(event) => setTipo(event.target.value)}
            value={tipo}
          >
            {TIPOS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel className="text-xs">Medio (efectivo)</FieldLabel>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            name="medioPagoId"
          >
            {mediosEfectivo.map((medio) => (
              <option key={medio.id} value={medio.id}>
                {medio.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel className="text-xs">Monto</FieldLabel>
          <Input
            inputMode="decimal"
            min={tipo === "ajuste" ? undefined : "0.01"}
            name="monto"
            placeholder="0.00"
            step="0.01"
            type="number"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel className="text-xs">
          Nota{notaRequerida ? " (obligatoria)" : ""}
        </FieldLabel>
        <Input
          maxLength={500}
          name="notas"
          placeholder={
            tipo === "retiro"
              ? "Ej. retiro del dueño"
              : tipo === "gasto"
                ? "Ej. compra de insumos menores"
                : tipo === "deposito"
                  ? "Ej. depósito a cuenta bancaria"
                  : tipo === "ajuste"
                    ? "Ej. sobrante/faltante detectado"
                    : "Ej. préstamo para cambio"
          }
        />
      </Field>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" data-action-id="caja.movimiento.registrar" disabled={pending} type="submit" variant="outline">
        {pending ? "Registrando…" : "Registrar movimiento"}
      </Button>
    </form>
  );
}
