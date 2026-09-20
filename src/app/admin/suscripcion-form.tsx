"use client";

import { useActionState } from "react";

import { registrarPagoSuscripcion } from "@/app/admin/billing-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

export type EstadoSuscripcionAdmin =
  | { tipo: "sin-suscripcion" }
  | { tipo: "trialing"; diasRestantes: number | null }
  | { tipo: "activa"; termina: string | null }
  | { tipo: "vencida" };

function estadoLabel(estado: EstadoSuscripcionAdmin): { texto: string; tono: string } {
  switch (estado.tipo) {
    case "trialing":
      return {
        texto: `Prueba${estado.diasRestantes !== null ? ` · ${estado.diasRestantes} días` : ""}`,
        tono: "bg-[#fdf7ef] text-[#7a4f22] border-[#ecd9c4]",
      };
    case "activa":
      return {
        texto: `Activa${estado.termina ? ` · hasta ${estado.termina}` : ""}`,
        tono: "bg-[#edf5f0] text-[#2f6a4b] border-[#cfe4d8]",
      };
    case "vencida":
      return { texto: "Vencida (solo lectura)", tono: "bg-[#fdf0ea] text-[#8a3c1d] border-[#efc9b8]" };
    default:
      return { texto: "Sin suscripción", tono: "bg-[#f4f1ee] text-[#786b63] border-[#e5ddd6]" };
  }
}

/**
 * Fila de organización para el admin de plataforma: estado de suscripción y
 * formulario plegable para registrar un pago manual (transferencia) que activa
 * el plan por N meses. Solo lectura para suscripciones vigentes largas.
 */
export function SuscripcionAdminRow({
  estado,
  organizationId,
}: {
  organizationId: string;
  estado: EstadoSuscripcionAdmin;
}) {
  const [state, formAction, isPending] = useActionState(registrarPagoSuscripcion, {});
  const badge = estadoLabel(estado);

  return (
    <div className="rounded-xl border border-[#eee6e0] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge.tono}`}>
          {badge.texto}
        </span>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[#a76348]">
          Registrar pago / activar plan
        </summary>
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <Field>
            <FieldLabel required>Meses</FieldLabel>
            <Input defaultValue="1" min={1} max={24} name="meses" required type="number" />
          </Field>
          <Field>
            <FieldLabel required>Monto (MXN)</FieldLabel>
            <Input min={0} name="monto" placeholder="0.00" required step="0.01" type="number" />
          </Field>
          <Field>
            <FieldLabel>Referencia</FieldLabel>
            <Input maxLength={160} name="referencia" placeholder="Transferencia, folio…" />
          </Field>
          <Button className="rounded-xl" disabled={isPending} size="sm" type="submit">
            {isPending ? "Guardando…" : "Activar"}
          </Button>
          <div className="sm:col-span-4">
            <ActionFeedback state={state} successMessage="Suscripción activada." />
          </div>
        </form>
      </details>
    </div>
  );
}
