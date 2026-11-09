"use client";

import { Printer, MessageCircle, Share2 } from "lucide-react";
import { useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { renderTicketToPng } from "@/lib/ticket-imagen";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

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
  /** Si es true, el comprobante se marca como preliminar (venta en proceso). */
  preliminar?: boolean;
};

/**
 * Comprobante de venta reutilizable:
 * - `ComprobanteImprimible`: bloque `hidden print:block` (ticket térmico 80 mm)
 *   que solo aparece al mandar a imprimir.
 * - `TicketCapturaImagen`: contenedor fuera de pantalla con estilos inline
 *   para generar la imagen PNG del ticket.
 * - `TicketActionsBar`: botones de acción (Imprimir / WhatsApp / Compartir
 *   imagen) + ambos bloques anteriores.
 */

/** Todas las líneas del ticket aplanadas (servicios, productos, paquetes, membresías). */
function lineasTicketTodas(props: PrintableTicketProps) {
  return [
    ...props.lineasServicios.map((l) => ({ ...l, tipo: "servicio" as const })),
    ...props.lineasProductos.map((l) => ({ ...l, tipo: "producto" as const })),
    ...(props.lineasPaquetes ?? []).map((l) => ({ ...l, tipo: "paquete" as const })),
    ...(props.lineasMembresias ?? []).map((l) => ({ ...l, tipo: "membresia" as const })),
  ];
}

const estiloLineaCaptura: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 4,
  fontSize: 11,
  lineHeight: 1.3,
};

/**
 * Bloque imprimible del comprobante (ticket térmico 80 mm).
 * `hidden print:block` — invisible en pantalla, aparece solo al imprimir.
 */
export function ComprobanteImprimible({
  negocioNombre = "Salón",
  ventaId,
  clienteNombre,
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
  preliminar = false,
}: PrintableTicketProps) {
  return (
    <div className="hidden print:block print:fixed print:inset-0 print:m-0 print:p-4 print:bg-white print:text-black print:font-mono print:text-xs print:w-[72mm] print:mx-auto">
      <div className="text-center space-y-1 pb-3 border-b border-black">
        <p className="font-bold text-sm uppercase tracking-wider">{negocioNombre}</p>
        {preliminar ? (
          <p className="text-[10px] font-bold">PRELIMINAR — NO VÁLIDO COMO COMPROBANTE</p>
        ) : (
          <p className="text-[10px]">COMPROBANTE DE VENTA</p>
        )}
        <p className="text-[10px]">Folio: #{ventaId.slice(0, 8).toUpperCase()}</p>
        <p className="text-[10px]" suppressHydrationWarning>
          {formatDate(fecha)} · {formatTime(fecha)}
        </p>
        <p className="text-[10px]">Cliente: {clienteNombre ?? "Cliente de paso"}</p>
      </div>

      <div className="py-2 space-y-1.5 border-b border-black">
        {[...lineasServicios, ...lineasProductos, ...lineasPaquetes, ...lineasMembresias].map((l) => (
          <div className="text-[11px]" key={l.id}>
            <div className="flex justify-between gap-1">
              <span className="truncate">
              {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
              {l.nombre}
            </span>
            <span className="tabular-nums shrink-0">
              {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
            </span>
            </div>
            {l.cantidad > 1 ? (
              <div className="text-[9px] text-gray-500 text-right">
                {l.cantidad} × {formatCurrency(l.precio, { currency })}
              </div>
            ) : null}
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
  );
}

/**
 * Contenedor de captura del ticket (fuera de pantalla) para `renderTicketToPng`.
 * `capturaRef` la usa quien dispara la generación de imagen.
 */
export function TicketCapturaImagen({
  capturaRef,
  negocioNombre = "Salón",
  ventaId,
  clienteNombre,
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
  preliminar = false,
}: PrintableTicketProps & { capturaRef: RefObject<HTMLDivElement | null> }) {
  const lineasTodas = lineasTicketTodas({
    negocioNombre,
    ventaId,
    clienteNombre,
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
    preliminar,
  });

  return (
    <div
      ref={capturaRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: -9999,
        top: 0,
        width: 320,
        background: "#ffffff",
        color: "#000000",
        fontFamily: "monospace",
        fontSize: 11,
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", paddingBottom: 8, borderBottom: "1px solid #000" }}>
        <p style={{ fontWeight: "bold", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
          {negocioNombre}
        </p>
        {preliminar ? (
          <p style={{ fontSize: 10, fontWeight: "bold", margin: "4px 0 0" }}>
            PRELIMINAR — NO VÁLIDO COMO COMPROBANTE
          </p>
        ) : (
          <p style={{ fontSize: 10, margin: "4px 0 0" }}>COMPROBANTE DE VENTA</p>
        )}
        <p style={{ fontSize: 10, margin: "4px 0 0" }}>Folio: #{ventaId.slice(0, 8).toUpperCase()}</p>
        <p style={{ fontSize: 10, margin: "4px 0 0" }} suppressHydrationWarning>
          {formatDate(fecha)} · {formatTime(fecha)}
        </p>
        <p style={{ fontSize: 10, margin: "4px 0 0" }}>Cliente: {clienteNombre ?? "Cliente de paso"}</p>
      </div>

      <div style={{ padding: "8px 0", borderBottom: "1px solid #000" }}>
        {lineasTodas.map((l) => (
          <div key={l.id} style={{ marginBottom: 2 }}>
            <div style={estiloLineaCaptura}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.cantidad > 1 ? `${l.cantidad}x ` : ""}
                {l.nombre}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                {formatCurrency(Number(l.precio) * l.cantidad, { currency })}
              </span>
            </div>
            {l.cantidad > 1 ? (
              <div style={{ fontSize: 9, color: "#555", textAlign: "right" }}>
                {l.cantidad} × {formatCurrency(l.precio, { currency })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 0", borderBottom: "1px solid #000", fontSize: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal:</span>
          <span>{formatCurrency(subtotal, { currency })}</span>
        </div>
        {Number(descuento ?? 0) > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Descuento:</span>
            <span>-{formatCurrency(descuento ?? "0", { currency })}</span>
          </div>
        ) : null}
        {Number(descuentoPromocion ?? 0) > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Promoción:</span>
            <span>-{formatCurrency(descuentoPromocion ?? "0", { currency })}</span>
          </div>
        ) : null}
        {Number(descuentoMembresia ?? 0) > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Membresía:</span>
            <span>-{formatCurrency(descuentoMembresia ?? "0", { currency })}</span>
          </div>
        ) : null}
        {Number(propina ?? 0) > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Propina:</span>
            <span>+{formatCurrency(propina ?? "0", { currency })}</span>
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: "bold",
            fontSize: 12,
            paddingTop: 4,
            borderTop: "1px dashed #000",
          }}
        >
          <span>TOTAL:</span>
          <span>{formatCurrency(total, { currency })}</span>
        </div>
      </div>

      {pagos.length > 0 ? (
        <div style={{ padding: "8px 0", borderBottom: "1px solid #000", fontSize: 10 }}>
          <p style={{ fontWeight: "bold", margin: "0 0 2px" }}>FORMA DE PAGO:</p>
          {pagos.map((p) => (
            <div key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {p.nombre}
                  {p.referencia ? ` (${p.referencia})` : ""}
                </span>
                <span>{formatCurrency(p.monto, { currency })}</span>
              </div>
              {Number(p.recibido) > 0 && Number(p.recibido) !== Number(p.monto) ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555" }}>
                  <span>Recibido</span>
                  <span>{formatCurrency(p.recibido, { currency })}</span>
                </div>
              ) : null}
              {Number(p.cambio) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555" }}>
                  <span>Cambio</span>
                  <span>{formatCurrency(p.cambio, { currency })}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ textAlign: "center", paddingTop: 12, fontSize: 10 }}>
        <p style={{ fontWeight: "bold", margin: 0 }}>¡Gracias por tu preferencia!</p>
        <p style={{ margin: "2px 0 0" }}>Conserva este comprobante para cualquier duda o aclaración.</p>
      </div>
    </div>
  );
}

/**
 * Componente de comprobante / ticket térmico:
 * 1. Botones de acción en pantalla: Imprimir ticket, Enviar por WhatsApp,
 *    Compartir imagen (PNG).
 * 2. `ComprobanteImprimible`: bloque HTML optimizado para impresoras
 *    térmicas de 58 mm o 80 mm (print:block).
 * 3. `TicketCapturaImagen`: contenedor de captura (renderizado, fuera de
 *    pantalla) con estilos inline para generar la imagen PNG.
 */
export function TicketActionsBar(props: PrintableTicketProps) {
  const {
    negocioNombre = "Salón",
    ventaId,
    clienteNombre,
    clienteTelefono,
    lineasServicios,
    lineasProductos,
    lineasPaquetes = [],
    lineasMembresias = [],
    total,
    currency,
    preliminar = false,
  } = props;
  const toast = useToast();
  const capturaRef = useRef<HTMLDivElement>(null);

  const todasLasLineas = [
    ...lineasServicios.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasProductos.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasPaquetes.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
    ...lineasMembresias.map((l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`),
  ];

  const mensajeWhatsApp = [
    `*${negocioNombre}* · Comprobante de pago${preliminar ? " (preliminar)" : ""}`,
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

  const handleWhatsApp = async () => {
    // Intentar compartir la imagen del ticket vía el menú nativo del sistema
    // (permite adjuntar el PNG a WhatsApp). Si el navegador no soporta compartir
    // archivos, caer al enlace wa.me con el texto del comprobante.
    if (capturaRef.current) {
      try {
        const blob = await renderTicketToPng(capturaRef.current);
        const file = new File([blob], `ticket-${ventaId.slice(0, 8)}.png`, { type: "image/png" });
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({ files: [file], title: "Ticket", text: mensajeWhatsApp });
          toast.success("Ticket compartido.");
          return;
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }
    }
    // Fallback: enlace wa.me con texto (sin imagen).
    window.open(whatsappHref, "_blank", "noopener,noreferrer");
  };

  const handleCompartirImagen = async () => {
    if (!capturaRef.current) {
      toast.error("No se pudo generar la imagen.");
      return;
    }
    try {
      const blob = await renderTicketToPng(capturaRef.current);
      const file = new File([blob], `ticket-${ventaId.slice(0, 8)}.png`, { type: "image/png" });
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "Ticket", text: mensajeWhatsApp });
        toast.success("Ticket compartido.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ticket-${ventaId.slice(0, 8)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Imagen descargada.");
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("No se pudo generar la imagen.");
      }
    }
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
          {preliminar ? "Imprimir preliminar" : "Imprimir ticket"}
        </Button>

        <Button
          className="rounded-xl shadow-xs font-semibold border-success/30 bg-success-soft text-success-soft-foreground hover:bg-success-soft/80"
          data-action-id="pos.ticket.whatsapp"
          onClick={handleWhatsApp}
          size="sm"
          type="button"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" className="size-4 mr-1.5 text-success-soft-foreground" />
          Enviar por WhatsApp
        </Button>

        <Button
          className="rounded-xl shadow-xs font-semibold"
          data-action-id="pos.ticket.imagen"
          onClick={handleCompartirImagen}
          size="sm"
          type="button"
          variant="outline"
        >
          <Share2 aria-hidden="true" className="size-4 mr-1.5 text-primary" />
          Compartir imagen
        </Button>
      </div>

      <ComprobanteImprimible {...props} />
      <TicketCapturaImagen {...props} capturaRef={capturaRef} />
    </>
  );
}
