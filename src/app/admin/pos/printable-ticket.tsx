"use client";

import { Printer, MessageCircle } from "lucide-react";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

export type PrintableTicketProps = {
  negocioNombre?: string;
  ventaId: string;
  clienteNombre?: string | null;
  clienteTelefono?: string | null;
  fecha?: Date | string;
  lineasServicios: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  lineasProductos: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  lineasPaquetes?: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  lineasMembresias?: Array<{ id: string; nombre: string; precio: string; cantidad: number }>;
  subtotal: string;
  descuento?: string;
  descuentoPromocion?: string;
  descuentoMembresia?: string;
  propina?: string;
  total: string;
  pagos: Array<{
    id: string;
    nombre: string;
    monto: string;
    recibido: string;
    cambio: string;
    referencia?: string | null;
  }>;
  currency: string;
};

/**
 * Componente de comprobante / ticket térmico:
 * 1. Botones de acción en pantalla: Imprimir ticket y Enviar por WhatsApp.
 * 2. Bloque HTML optimizado para impresoras térmicas de 58 mm o 80 mm (print:block).
 */
export function TicketActionsBar({
  negocioNombre = "Salón",
  ventaId,
  clienteNombre,
  clienteTelefono,
  fecha = new Date(),
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
}: PrintableTicketProps) {
  const todasLasLineas = [
    ...lineasServicios.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasProductos.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasPaquetes.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasMembresias.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
  ];

  const mensajeWhatsApp = [
    `*${negocioNombre}* · Comprobante de pago`,
    `Folio: #${ventaId.slice(0, 8).toUpperCase()}`,
    clienteNombre ? `Cliente: ${clienteNombre}` : null,
    todasLasLineas.length > 0 ? `Conceptos: ${todasLasLineas.join(", ")}` : null,
    `Total: ${formatCurrency(total, { currency })}`,
    `¡Muchas gracias por tu visita! Te esperamos pronto.`,
  ]
    .filter(Boolean)
    .join("\n");

  const telefonoLimpio = clienteTelefono ? clienteTelefono.replace(/\D/g, "") : "";
  const whatsappHref = telefonoLimpio
    ? `https://wa.me/52${telefonoLimpio}?text=${encodeURIComponent(mensajeWhatsApp)}`
    : `https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          className="rounded-xl shadow-xs font-semibold"
          data-action-id="pos.ticket.imprimir"
          onClick={handlePrint}
          size="sm"
          type="button"
          variant="outline"
        >
          <Printer aria-hidden="true" className="size-4 mr-1.5 text-primary" />
          Imprimir ticket
        </Button>

        <Button
          className="rounded-xl shadow-xs font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
          data-action-id="pos.ticket.whatsapp"
          nativeButton={false}
          render={
            <a
              href={whatsappHref}
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          size="sm"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" className="size-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
          Enviar por WhatsApp
        </Button>
      </div>

      {/* Formato de ticket térmico imprimible (80mm) — solo visible al mandar a imprimir */}
      <div className="hidden print:block print:fixed print:inset-0 print:m-0 print:p-4 print:bg-white print:text-black print:font-mono print:text-xs print:w-[72mm] print:mx-auto">
        <div className="text-center space-y-1 pb-3 border-b border-black">
          <p className="font-bold text-sm uppercase tracking-wider">{negocioNombre}</p>
          <p className="text-[10px]">COMPROBANTE DE VENTA</p>
          <p className="text-[10px]">Folio: #{ventaId.slice(0, 8).toUpperCase()}</p>
          <p className="text-[10px]">
            {formatDate(fecha)} · {formatTime(fecha)}
          </p>
          <p className="text-[10px]">Cliente: {clienteNombre ?? "Cliente de paso"}</p>
        </div>

        <div className="py-2 space-y-1.5 border-b border-black">
          {lineasServicios.map((l) => (
            <div className="flex justify-between gap-1 text-[11px]" key={l.id}>
              <span className="truncate">
                {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
                {l.nombre}
              </span>
              <span className="tabular-nums shrink-0">
                {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
              </span>
            </div>
          ))}
          {lineasProductos.map((l) => (
            <div className="flex justify-between gap-1 text-[11px]" key={l.id}>
              <span className="truncate">
                {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
                {l.nombre}
              </span>
              <span className="tabular-nums shrink-0">
                {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
              </span>
            </div>
          ))}
          {lineasPaquetes.map((l) => (
            <div className="flex justify-between gap-1 text-[11px]" key={l.id}>
              <span className="truncate">
                {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
                {l.nombre}
              </span>
              <span className="tabular-nums shrink-0">
                {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
              </span>
            </div>
          ))}
          {lineasMembresias.map((l) => (
            <div className="flex justify-between gap-1 text-[11px]" key={l.id}>
              <span className="truncate">
                {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
                {l.nombre}
              </span>
              <span className="tabular-nums shrink-0">
                {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
              </span>
            </div>
          ))}
        </div>

        <div className="py-2 space-y-1 text-[11px] border-b border-black">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="tabular-nums">{formatCurrency(subtotal, { currency })}</span>
          </div>
          {Number(descuento ?? 0) > 0 ? (
            <div className="flex justify-between">
              <span>Descuento:</span>
              <span className="tabular-nums">-{formatCurrency(descuento ?? "0", { currency })}</span>
            </div>
          ) : null}
          {Number(descuentoPromocion ?? 0) > 0 ? (
            <div className="flex justify-between">
              <span>Promoción:</span>
              <span className="tabular-nums">-{formatCurrency(descuentoPromocion ?? "0", { currency })}</span>
            </div>
          ) : null}
          {Number(descuentoMembresia ?? 0) > 0 ? (
            <div className="flex justify-between">
              <span>Membresía:</span>
              <span className="tabular-nums">-{formatCurrency(descuentoMembresia ?? "0", { currency })}</span>
            </div>
          ) : null}
          {Number(propina ?? 0) > 0 ? (
            <div className="flex justify-between">
              <span>Propina:</span>
              <span className="tabular-nums">+{formatCurrency(propina ?? "0", { currency })}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold text-xs pt-1 border-t border-dashed border-black">
            <span>TOTAL:</span>
            <span className="tabular-nums">{formatCurrency(total, { currency })}</span>
          </div>
        </div>

        {pagos.length > 0 ? (
          <div className="py-2 space-y-1 text-[10px] border-b border-black">
            <p className="font-semibold">FORMA DE PAGO:</p>
            {pagos.map((p) => (
              <div className="flex justify-between" key={p.id}>
                <span>
                  {p.nombre}
                  {p.referencia ? ` (${p.referencia})` : ""}
                </span>
                <span className="tabular-nums">{formatCurrency(p.monto, { currency })}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="text-center pt-3 space-y-0.5 text-[10px]">
          <p className="font-semibold">¡Gracias por tu preferencia!</p>
          <p>Conserva este comprobante para cualquier duda o aclaración.</p>
        </div>
      </div>
    </>
  );
}
