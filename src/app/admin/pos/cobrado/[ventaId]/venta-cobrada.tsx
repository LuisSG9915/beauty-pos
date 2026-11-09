"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Printer, Send } from "lucide-react";

import {
  ComprobanteImprimible,
  TicketCapturaImagen,
  type PrintableTicketProps,
} from "@/app/admin/pos/printable-ticket";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { enlaceWhatsApp, textoTicketWhatsApp } from "@/lib/whatsapp";

type VentaCobradaProps = PrintableTicketProps & {
  organizationId: string;
  sucursalId: string;
};

/** Países para el prefijo del número de WhatsApp. */
const PAISES_WHATSAPP: Array<{ etiqueta: string; codigo: string }> = [
  { etiqueta: "México", codigo: "52" },
  { etiqueta: "Estados Unidos", codigo: "1" },
  { etiqueta: "España", codigo: "34" },
  { etiqueta: "Colombia", codigo: "57" },
  { etiqueta: "Argentina", codigo: "54" },
  { etiqueta: "Chile", codigo: "56" },
  { etiqueta: "Perú", codigo: "51" },
];

/**
 * Pantalla "Venta cobrada" (página propia, no modal): total, formas de pago,
 * cambio a entregar real, WhatsApp con teléfono prellenado, impresión del
 * comprobante real y acciones para ver la venta o abrir una nueva.
 */
export function VentaCobrada(props: VentaCobradaProps) {
  const {
    negocioNombre = "Salón",
    ventaId,
    clienteNombre,
    clienteTelefono,
    fecha,
    lineasServicios,
    lineasProductos,
    lineasPaquetes = [],
    lineasMembresias = [],
    subtotal,
    descuento,
    descuentoPromocion,
    descuentoMembresia,
    propina,
    total,
    pagos,
    currency,
    organizationId,
    sucursalId,
  } = props;

  const capturaRef = useRef<HTMLDivElement>(null);
  const [paisCodigo, setPaisCodigo] = useState(PAISES_WHATSAPP[0].codigo);
  const [telefono, setTelefono] = useState(() => (clienteTelefono ?? "").replace(/\D/g, ""));

  const cambioTotal = pagos.reduce((s, p) => s + Number(p.cambio || 0), 0);

  const mensaje = useMemo(
    () =>
      textoTicketWhatsApp({
        negocio: negocioNombre,
        fecha,
        cliente: clienteNombre,
        lineas: [
          ...lineasServicios,
          ...lineasProductos,
          ...lineasPaquetes,
          ...lineasMembresias,
        ],
        total,
        pagos,
        moneda: currency,
      }),
    [negocioNombre, fecha, clienteNombre, lineasServicios, lineasProductos, lineasPaquetes, lineasMembresias, total, pagos, currency],
  );

  const digitos = telefono.replace(/\D/g, "");
  const whatsappHref = enlaceWhatsApp({
    telefono: digitos ? `${paisCodigo}${digitos}` : null,
    texto: mensaje,
  });

  const urlVenta = buildAdminHref("/pos", {
    organizationId,
    sucursalId,
    extra: { ventaId },
  });
  const urlNuevaVenta = buildAdminHref("/pos", {
    organizationId,
    sucursalId,
    extra: { nueva: "1" },
  });

  const imprimir = () => window.print();

  const propsTicket = {
    negocioNombre,
    ventaId,
    clienteNombre,
    clienteTelefono,
    fecha,
    lineasServicios,
    lineasProductos,
    lineasPaquetes,
    lineasMembresias,
    subtotal,
    descuento,
    descuentoPromocion,
    descuentoMembresia,
    propina,
    total,
    pagos,
    currency,
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {/* Todo lo visible se oculta al imprimir: solo sale el comprobante. */}
      <div className="space-y-4 print:hidden">
      <section className="rounded-2xl border border-success/30 bg-success-soft p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-success-soft-foreground">
              Venta cobrada
            </h1>
            <p className="mt-0.5 text-op-xs text-muted-foreground">
              {[
                fecha ? `${formatDate(fecha)} · ${formatTime(fecha)}` : null,
                clienteNombre ?? "Cliente de paso",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
          {formatCurrency(total, { currency })}
        </p>

        {pagos.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {pagos.map((pago) => (
              <li className="flex items-baseline justify-between gap-3" key={pago.id}>
                <span className="min-w-0 truncate text-muted-foreground">
                  {pago.nombre}
                  {pago.referencia ? ` · ${pago.referencia}` : ""}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatCurrency(pago.monto, { currency })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {cambioTotal > 0 ? (
          <p className="mt-4 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-center">
            <span className="block text-op-xs font-medium text-warning-soft-foreground">
              Cambio a entregar
            </span>
            <span className="block text-2xl font-bold tabular-nums text-warning-soft-foreground">
              {formatCurrency(cambioTotal, { currency })}
            </span>
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">
          Enviar ticket por WhatsApp
        </h2>
        <div className="mt-3 grid grid-cols-[7.5rem_minmax(0,1fr)] items-end gap-2">
          <Field>
            <FieldLabel htmlFor="cobrado-pais">País</FieldLabel>
            <Select
              id="cobrado-pais"
              onChange={(e) => setPaisCodigo(e.target.value)}
              value={paisCodigo}
            >
              {PAISES_WHATSAPP.map((pais) => (
                <option key={pais.codigo} value={pais.codigo}>
                  +{pais.codigo} {pais.etiqueta}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="cobrado-telefono">Teléfono del cliente</FieldLabel>
            <Input
              id="cobrado-telefono"
              inputMode="tel"
              maxLength={15}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="10 dígitos"
              value={telefono}
            />
          </Field>
        </div>
        <Button
          className="mt-3 w-full rounded-xl font-semibold"
          data-action-id="pos.cobrado.whatsapp"
          nativeButton={false}
          render={<Link href={whatsappHref} rel="noopener noreferrer" target="_blank" />}
          size="touch"
          variant="outline"
        >
          <Send aria-hidden="true" className="size-4" />
          Enviar por WhatsApp
        </Button>
      </section>

      <div className="grid gap-2">
        <Button
          className="w-full rounded-xl font-bold"
          data-action-clave="1"
          data-action-id="pos.cobrado.nueva_venta"
          nativeButton={false}
          render={<Link href={urlNuevaVenta} />}
          size="touch"
        >
          Nueva venta
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="rounded-xl font-semibold"
            data-action-id="pos.cobrado.imprimir"
            onClick={imprimir}
            size="touch"
            variant="outline"
          >
            <Printer aria-hidden="true" className="size-4" />
            Imprimir ticket
          </Button>
          <Button
            className="rounded-xl font-semibold"
            data-action-id="pos.cobrado.ver_venta"
            nativeButton={false}
            render={<Link href={urlVenta} />}
            size="touch"
            variant="outline"
          >
            Ver venta
          </Button>
        </div>
      </div>
      </div>

      {/* Comprobante real para impresión (solo visible con print) y captura
          para la imagen del ticket (integración de la misión 74). */}
      <ComprobanteImprimible {...propsTicket} />
      <TicketCapturaImagen {...propsTicket} capturaRef={capturaRef} />
    </div>
  );
}
