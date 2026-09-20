"use client";

import { useActionState } from "react";

import { registrarGastoAction } from "@/app/admin/gastos/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export type MedioPagoOpcion = { id: string; nombre: string; categoria: string };
export type CategoriaGastoOpcion = { id: string; nombre: string };

const CATEGORIA_MEDIO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  wallet: "Wallet",
  otro: "Otro",
};

export function GastoForm({
  organizationId,
  sucursalId,
  medios,
  categorias,
  fechaHoy,
}: {
  organizationId: string;
  sucursalId: string;
  medios: MedioPagoOpcion[];
  categorias: CategoriaGastoOpcion[];
  fechaHoy: string;
}) {
  const [state, action, pending] = useActionState(registrarGastoAction, initialActionState);

  return (
    <form action={action} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <h2 className="text-xl font-semibold text-[#2d2926]">Registrar gasto</h2>
      <p className="mt-1 text-sm leading-6 text-[#625b55]">
        En efectivo descuenta del corte abierto; tarjeta, transferencia u otros medios no tocan el cajón.
      </p>

      <div className="mt-5 space-y-4">
        <Field>
          <FieldLabel required>Concepto</FieldLabel>
          <Input name="concepto" placeholder="Renta del local, insumos, luz…" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel required>Fecha del gasto</FieldLabel>
            <Input defaultValue={fechaHoy} name="fechaGasto" type="date" required />
          </Field>
          <Field>
            <FieldLabel required>Importe</FieldLabel>
            <Input min="0.01" name="importe" placeholder="0.00" required step="0.01" type="number" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
            <FieldLabel>Categoría</FieldLabel>
            <Select name="categoriaId">
              <option value="">Sin categoría</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Proveedor</FieldLabel>
            <Input name="proveedor" placeholder="Opcional" />
          </Field>
          <Field>
            <FieldLabel>Referencia</FieldLabel>
            <Input name="referencia" placeholder="Folio, factura, transferencia…" />
          </Field>
        </div>

        <Field>
          <FieldLabel>Notas</FieldLabel>
          <Input name="notas" placeholder="Opcional" />
        </Field>
      </div>

      <div className="mt-4">
        <ActionFeedback state={state} />
      </div>
      <Button className="mt-5 rounded-xl" disabled={pending} type="submit">
        {pending ? "Registrando…" : "Registrar gasto"}
      </Button>
    </form>
  );
}
