"use client";

import { useActionState, useState } from "react";

import { registrarPagoSuscripcion } from "@/app/admin/billing-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { cotizarSuscripcion, planPreciosDesdeFila, type Periodicidad } from "@/modules/billing/precios";

export type EstadoSuscripcionAdmin =
  | { tipo: "sin-suscripcion" }
  | { tipo: "trialing"; diasRestantes: number | null }
  | { tipo: "activa"; termina: string | null }
  | { tipo: "vencida" };

export type PlanOpcion = {
  clave: string;
  nombre: string;
  precioMensual: string;
  precioAnual: string | null;
  sucursalesIncluidas: number;
  precioSucursalExtra: string | null;
};

/** Última solicitud de cambio pendiente: pre-llena el formulario del admin. */
export type SolicitudSugerida = {
  planClave: string;
  periodicidad: "mensual" | "anual";
  sucursales: number;
};

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

const selectClass =
  "w-full rounded-xl border border-[#e5ddd6] bg-white px-3 py-2 text-sm text-[#2d2926] focus:border-[#c98a6b] focus:outline-none";

/**
 * Fila de organización para el admin de plataforma: estado de suscripción y
 * formulario plegable para registrar un pago manual (transferencia). El pago
 * aplica el plan/periodicidad/sucursales elegidos — pre-llenados con la
 * última solicitud del propietario cuando existe.
 */
export function SuscripcionAdminRow({
  estado,
  organizationId,
  planes,
  sugerida,
}: {
  organizationId: string;
  estado: EstadoSuscripcionAdmin;
  planes: PlanOpcion[];
  sugerida?: SolicitudSugerida;
}) {
  const [state, formAction, isPending] = useActionState(registrarPagoSuscripcion, {});
  const badge = estadoLabel(estado);

  const [planClave, setPlanClave] = useState(sugerida?.planClave ?? planes[0]?.clave ?? "");
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(sugerida?.periodicidad ?? "mensual");
  const [facturadas, setFacturadas] = useState(sugerida?.sucursales ?? 1);
  const [meses, setMeses] = useState(sugerida?.periodicidad === "anual" ? 12 : 1);

  const planSel = planes.find((p) => p.clave === planClave);
  const cotizacion = planSel
    ? cotizarSuscripcion(planPreciosDesdeFila(planSel), {
        periodicidad,
        sucursalesFacturadas: facturadas,
        meses,
      })
    : null;
  const fmtMonto = (v: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);

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
        <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <Field>
            <FieldLabel required>Plan</FieldLabel>
            <select
              className={selectClass}
              name="planClave"
              onChange={(e) => setPlanClave(e.target.value)}
              required
              value={planClave}
            >
              {planes.map((plan) => (
                <option key={plan.clave} value={plan.clave}>
                  {plan.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel required>Periodicidad</FieldLabel>
            <select
              className={selectClass}
              name="periodicidad"
              onChange={(e) => {
                const modo = e.target.value as Periodicidad;
                setPeriodicidad(modo);
                if (modo === "anual") setMeses(12);
              }}
              required
              value={periodicidad}
            >
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
            </select>
          </Field>
          <Field>
            <FieldLabel required>Sucursales</FieldLabel>
            <Input
              max={50}
              min={1}
              name="sucursalesFacturadas"
              onChange={(e) => setFacturadas(Number(e.target.value) || 1)}
              required
              type="number"
              value={facturadas}
            />
          </Field>
          <Field>
            <FieldLabel required>Meses cubiertos</FieldLabel>
            <Input
              max={24}
              min={1}
              name="meses"
              onChange={(e) => setMeses(Number(e.target.value) || 1)}
              required
              type="number"
              value={meses}
            />
          </Field>
          <Field>
            <FieldLabel>Total a cobrar</FieldLabel>
            <p className="rounded-xl border border-[#e5ddd6] bg-[#faf6f3] px-3 py-2 text-sm font-semibold text-[#2d2926]">
              {cotizacion?.ok
                ? `${fmtMonto(cotizacion.monto)} MXN${cotizacion.extras > 0 ? ` (${cotizacion.extras} extra × ${fmtMonto(cotizacion.precioExtraUnitario)})` : ""}`
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-[#95877e]">Se calcula del catálogo al confirmar.</p>
          </Field>
          <Field>
            <FieldLabel>Referencia</FieldLabel>
            <Input maxLength={160} name="referencia" placeholder="Transferencia, folio…" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
            <Button className="rounded-xl" disabled={isPending} size="sm" type="submit">
              {isPending ? "Guardando…" : "Confirmar pago y activar"}
            </Button>
            <ActionFeedback state={state} successMessage="Suscripción activada." />
          </div>
        </form>
      </details>
    </div>
  );
}
