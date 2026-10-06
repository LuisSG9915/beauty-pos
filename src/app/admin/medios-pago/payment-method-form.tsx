"use client";

import { useActionState } from "react";

import { savePaymentMethod, type PaymentMethodActionState } from "@/app/admin/medios-pago/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

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
    <form action={action} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar medio de pago" : "Nuevo medio de pago"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Define cómo se puede pagar en Cobrar: efectivo, tarjeta, transferencia, etc.</p>
      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel required>Nombre</FieldLabel>
            <Input defaultValue={initial?.nombre} name="nombre" placeholder="Efectivo" required />
          </Field>
        </div>
        <Field>
          <FieldLabel required>Categoría</FieldLabel>
          <Select defaultValue={categoria} name="categoria">
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="wallet">Wallet digital</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">{CATEGORIA_DESC[categoria]}</p>
        {initial ? (
          <details className="rounded-xl border border-border bg-muted/60 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
              Opciones avanzadas
            </summary>
            <Field className="mt-3">
              <FieldLabel>Clave</FieldLabel>
              <Input name="clave" placeholder={initial.clave} />
              <FieldDescription>Déjala vacía para conservar la clave actual.</FieldDescription>
            </Field>
          </details>
        ) : null}
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Medio de pago guardado." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">{pending ? "Guardando…" : "Guardar medio de pago"}</Button>
    </form>
  );
}
