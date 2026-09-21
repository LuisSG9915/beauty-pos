"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { emitirFactura } from "@/app/admin/facturacion/actions";
import { CancelarFacturaForm } from "@/app/admin/facturacion/cancelar-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import { FORMAS_PAGO, PUBLICO_EN_GENERAL, USOS_CFDI, REGIMENES_FISCALES } from "@/modules/facturacion/sat";

type Comprobante = {
  id: string;
  estado: string;
  serie: string | null;
  folio: number | null;
  uuid: string | null;
  receptorRfc: string;
  receptorNombre: string;
  total: string;
  error: string | null;
  timbradoAt: Date | null;
} | null;

type ClienteFiscal = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostalFiscal: string;
  usoCfdi: string | null;
} | null;

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-muted/60 text-warning" },
  timbrada: { label: "Emitida", className: "bg-[#d4efe9] text-success" },
  cancelada: { label: "Cancelada", className: "bg-muted/60 text-muted-foreground" },
  error: { label: "Error", className: "bg-[#f6d9d2] text-destructive" },
};

/** Panel de comprobante del ticket: genera el comprobante interno de la venta cobrada o muestra su estado. */
export function FacturarPanel({
  organizationId,
  ventaId,
  comprobante,
  clienteFiscal,
  facturacionConfigurada,
  formaPagoSugerida,
  currency,
}: {
  organizationId: string;
  ventaId: string;
  comprobante: Comprobante;
  clienteFiscal: ClienteFiscal;
  facturacionConfigurada: boolean;
  formaPagoSugerida: string;
  currency: string;
}) {
  const bloqueado = comprobante?.estado === "timbrada" || comprobante?.estado === "borrador";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Comprobante interno</h3>
        {comprobante ? (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${(ESTADO_BADGE[comprobante.estado] ?? ESTADO_BADGE.borrador).className}`}>
            {(ESTADO_BADGE[comprobante.estado] ?? ESTADO_BADGE.borrador).label}
          </span>
        ) : null}
      </div>

      {comprobante ? (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Folio</span>
            <span className="font-mono text-xs">{comprobante.serie}-{comprobante.folio}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Receptor</span>
            <span className="text-right">{comprobante.receptorNombre} <span className="font-mono text-xs text-muted-foreground">{comprobante.receptorRfc}</span></span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Total</span>
            <span className="tabular-nums">{formatCurrency(comprobante.total, { currency })}</span>
          </div>
          {comprobante.uuid ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">UUID simulado</span>
              <span className="max-w-56 truncate font-mono text-xs" title={comprobante.uuid}>{comprobante.uuid}</span>
            </div>
          ) : null}
          {comprobante.error ? <p className="rounded-lg bg-[#f6d9d2] px-3 py-2 text-xs text-destructive">{comprobante.error}</p> : null}
          {comprobante.estado === "timbrada" ? (
            <p className="rounded-lg bg-[#fff1d1] px-3 py-2 text-xs text-warning">
              Folio simulado (sin PAC contratado) — documento interno, no tiene validez fiscal ante el SAT.
            </p>
          ) : null}
        </div>
      ) : null}

      {comprobante?.estado === "timbrada" ? (
        <div className="mt-4 border-t border-border pt-4">
          <CancelarFacturaForm comprobanteId={comprobante.id} organizationId={organizationId} />
        </div>
      ) : null}

      {!bloqueado ? (
        facturacionConfigurada ? (
          <EmitirForm
            clienteFiscal={clienteFiscal}
            formaPagoSugerida={formaPagoSugerida}
            organizationId={organizationId}
            reintento={comprobante?.estado === "error"}
            ventaId={ventaId}
          />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Configura primero los datos del emisor en{" "}
            <Link className="font-medium text-primary underline" href={`/admin/facturacion?organizationId=${organizationId}`}>
              Comprobantes
            </Link>
            .
          </p>
        )
      ) : null}
    </section>
  );
}

function EmitirForm({
  organizationId,
  ventaId,
  clienteFiscal,
  formaPagoSugerida,
  reintento,
}: {
  organizationId: string;
  ventaId: string;
  clienteFiscal: ClienteFiscal;
  formaPagoSugerida: string;
  reintento: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(emitirFactura, {});
  const [modo, setModo] = useState<"cliente" | "publico" | "otro">(clienteFiscal ? "cliente" : "publico");

  const receptor =
    modo === "cliente" && clienteFiscal
      ? {
          rfc: clienteFiscal.rfc,
          nombre: clienteFiscal.razonSocial || clienteFiscal.rfc,
          regimen: clienteFiscal.regimenFiscal,
          cp: clienteFiscal.codigoPostalFiscal,
          usoCfdi: clienteFiscal.usoCfdi ?? "S01",
        }
      : modo === "publico"
        ? { rfc: PUBLICO_EN_GENERAL.rfc, nombre: PUBLICO_EN_GENERAL.nombre, regimen: PUBLICO_EN_GENERAL.regimen, cp: "", usoCfdi: PUBLICO_EN_GENERAL.usoCfdi }
        : null;

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-border pt-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="metodoPago" type="hidden" value="PUE" />

      <div className="flex flex-wrap gap-3 text-sm">
        {clienteFiscal ? (
          <label className="flex items-center gap-1.5">
            <input checked={modo === "cliente"} className="accent-primary" name="receptorModo" onChange={() => setModo("cliente")} type="radio" />
            Datos del cliente
          </label>
        ) : null}
        <label className="flex items-center gap-1.5">
          <input checked={modo === "publico"} className="accent-primary" name="receptorModo" onChange={() => setModo("publico")} type="radio" />
          Público en general
        </label>
        <label className="flex items-center gap-1.5">
          <input checked={modo === "otro"} className="accent-primary" name="receptorModo" onChange={() => setModo("otro")} type="radio" />
          Otro receptor
        </label>
      </div>

      {receptor ? (
        <>
          <input name="receptorRfc" type="hidden" value={receptor.rfc} />
          <input name="receptorNombre" type="hidden" value={receptor.nombre} />
          <input name="receptorRegimen" type="hidden" value={receptor.regimen} />
          <input name="receptorCp" type="hidden" value={receptor.cp} />
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {receptor.nombre} · {receptor.rfc} · Régimen {receptor.regimen}
            {modo === "publico" ? " · CP del emisor" : ` · CP ${receptor.cp}`}
          </p>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel required>RFC</FieldLabel>
            <Input maxLength={13} name="receptorRfc" placeholder="AAA010101AAA" required />
          </Field>
          <Field>
            <FieldLabel required>Razón social</FieldLabel>
            <Input name="receptorNombre" required />
          </Field>
          <Field>
            <FieldLabel required>Régimen fiscal</FieldLabel>
            <Select name="receptorRegimen">
              {REGIMENES_FISCALES.map((r) => (
                <option key={r.clave} value={r.clave}>
                  {r.clave} · {r.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel required>CP fiscal</FieldLabel>
            <Input inputMode="numeric" maxLength={5} name="receptorCp" required />
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Uso de CFDI</FieldLabel>
          <Select defaultValue={receptor?.usoCfdi ?? "S01"} key={receptor?.usoCfdi ?? "S01"} name="usoCfdi">
            {USOS_CFDI.map((u) => (
              <option key={u.clave} value={u.clave}>
                {u.clave} · {u.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel required>Forma de pago</FieldLabel>
          <Select defaultValue={formaPagoSugerida} name="formaPago">
            {FORMAS_PAGO.map((f) => (
              <option key={f.clave} value={f.clave}>
                {f.clave} · {f.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={pending} type="submit">
        {pending ? "Generando…" : reintento ? "Reintentar" : "Generar comprobante"}
      </Button>
    </form>
  );
}
