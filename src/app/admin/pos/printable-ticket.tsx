"use client";

import { Copy, Download, Loader2, MessageCircle, Printer, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { renderTicketToPng } from "@/lib/ticket-imagen";
import { enlaceWhatsApp, textoTicketWhatsApp } from "@/lib/whatsapp";
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
  fontSize: 13,
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
        fontSize: 14,
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", paddingBottom: 10, borderBottom: "1px solid #000" }}>
        <p style={{ fontWeight: "bold", fontSize: 16, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
          {negocioNombre}
        </p>
        {preliminar ? (
          <p style={{ fontSize: 12, fontWeight: "bold", margin: "4px 0 0" }}>
            PRELIMINAR — NO VÁLIDO COMO COMPROBANTE
          </p>
        ) : (
          <p style={{ fontSize: 12, margin: "4px 0 0" }}>COMPROBANTE DE VENTA</p>
        )}
        <p style={{ fontSize: 12, margin: "4px 0 0" }}>Folio: #{ventaId.slice(0, 8).toUpperCase()}</p>
        <p style={{ fontSize: 12, margin: "4px 0 0" }} suppressHydrationWarning>
          {formatDate(fecha)} · {formatTime(fecha)}
        </p>
        <p style={{ fontSize: 12, margin: "4px 0 0" }}>Cliente: {clienteNombre ?? "Cliente de paso"}</p>
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
              <div style={{ fontSize: 10, color: "#555", textAlign: "right" }}>
                {l.cantidad} × {formatCurrency(l.precio, { currency })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div style={{ padding: "10px 0", borderBottom: "1px solid #000", fontSize: 13 }}>
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
        <div style={{ padding: "10px 0", borderBottom: "1px solid #000", fontSize: 12 }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555" }}>
                  <span>Recibido</span>
                  <span>{formatCurrency(p.recibido, { currency })}</span>
                </div>
              ) : null}
              {Number(p.cambio) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555" }}>
                  <span>Cambio</span>
                  <span>{formatCurrency(p.cambio, { currency })}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ textAlign: "center", paddingTop: 14, fontSize: 12 }}>
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
/** `navigator.share({ files })` disponible para este archivo concreto. */
function soportaCompartirArchivos(file: File): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

/** Portapapeles de imágenes disponible (Chrome/Edge de escritorio). */
function soportaPortapapelesImagen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem !== "undefined"
  );
}

export function TicketActionsBar(props: PrintableTicketProps) {
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
    total,
    pagos,
    currency,
    preliminar = false,
  } = props;
  const toast = useToast();
  const capturaRef = useRef<HTMLDivElement>(null);

  // El PNG se genera por adelantado al montar/actualizar el ticket:
  // navigator.share exige activación de usuario en Safari y no se puede
  // generar dentro del clic.
  const [imagen, setImagen] = useState<{ blob: Blob; file: File } | null>(null);
  const [preparandoImagen, setPreparandoImagen] = useState(true);
  const [falloImagen, setFalloImagen] = useState(false);

  const firmaLineas = (lineas: Array<{ nombre: string; precio: string; cantidad: number }>) =>
    lineas.map((l) => `${l.nombre}:${l.precio}:${l.cantidad}`).join("|");
  const claveImagen = [
    negocioNombre,
    ventaId,
    clienteNombre ?? "",
    String(fecha ?? ""),
    currency,
    String(preliminar),
    total,
    firmaLineas(lineasServicios),
    firmaLineas(lineasProductos),
    firmaLineas(lineasPaquetes),
    firmaLineas(lineasMembresias),
    pagos.map((p) => `${p.monto}:${p.recibido}:${p.cambio}`).join("|"),
  ].join("~");

  useEffect(() => {
    const nodo = capturaRef.current;
    if (!nodo) return;
    let vivo = true;
    setPreparandoImagen(true);
    setFalloImagen(false);
    setImagen(null);
    renderTicketToPng(nodo)
      .then((blob) => {
        if (!vivo) return;
        setImagen({
          blob,
          file: new File([blob], `ticket-${ventaId.slice(0, 8)}.png`, {
            type: "image/png",
          }),
        });
        setPreparandoImagen(false);
      })
      .catch(() => {
        if (!vivo) return;
        setPreparandoImagen(false);
        setFalloImagen(true);
      });
    return () => {
      vivo = false;
    };
    // claveImagen resume todas las props que cambian el PNG.
  }, [claveImagen, ventaId]);

  const lineasMensaje = lineasTicketTodas(props);
  const mensajeWhatsApp = textoTicketWhatsApp({
    negocio: negocioNombre,
    fecha,
    cliente: clienteNombre,
    lineas: lineasMensaje,
    total,
    pagos,
    moneda: currency,
    preliminar,
  });
  const whatsappHref = enlaceWhatsApp({ telefono: clienteTelefono, texto: mensajeWhatsApp });

  const handlePrint = () => {
    window.print();
  };

  const handleCompartirImagen = async () => {
    if (!imagen) {
      toast.error("La imagen aún se está generando.");
      return;
    }
    try {
      // Solo el archivo: en iOS, title/text junto a files puede hacer que
      // WhatsApp descarte la imagen.
      await navigator.share({ files: [imagen.file] });
      toast.success("Ticket compartido.");
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("No se pudo compartir la imagen.");
      }
    }
  };

  const handleCopiarImagen = async () => {
    if (!imagen) {
      toast.error("La imagen aún se está generando.");
      return;
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": imagen.blob }),
      ]);
      toast.success("Imagen copiada. Pégala en el chat de WhatsApp.");
    } catch {
      toast.error("No se pudo copiar la imagen.");
    }
  };

  const handleDescargarImagen = () => {
    if (!imagen) {
      toast.error("La imagen aún se está generando.");
      return;
    }
    const url = URL.createObjectURL(imagen.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${ventaId.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Imagen descargada.");
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

        {preparandoImagen ? (
          <Button disabled size="sm" variant="outline">
            <Loader2 aria-hidden="true" className="size-4 mr-1.5 animate-spin" />
            Preparando imagen…
          </Button>
        ) : falloImagen ? (
          <Button disabled size="sm" variant="outline">
            Imagen no disponible
          </Button>
        ) : imagen && soportaCompartirArchivos(imagen.file) ? (
          <Button
            className="rounded-xl shadow-xs font-semibold"
            data-action-id="pos.ticket.compartir_imagen"
            onClick={handleCompartirImagen}
            size="sm"
            type="button"
            variant="outline"
          >
            <Share2 aria-hidden="true" className="size-4 mr-1.5 text-primary" />
            Compartir imagen
          </Button>
        ) : imagen && soportaPortapapelesImagen() ? (
          <Button
            className="rounded-xl shadow-xs font-semibold"
            data-action-id="pos.ticket.copiar_imagen"
            onClick={handleCopiarImagen}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" className="size-4 mr-1.5 text-primary" />
            Copiar imagen
          </Button>
        ) : (
          <Button
            className="rounded-xl shadow-xs font-semibold"
            data-action-id="pos.ticket.descargar_imagen"
            onClick={handleDescargarImagen}
            size="sm"
            type="button"
            variant="outline"
          >
            <Download aria-hidden="true" className="size-4 mr-1.5 text-primary" />
            Descargar imagen
          </Button>
        )}

        <Button
          className="rounded-xl shadow-xs font-semibold border-success/30 bg-success-soft text-success-soft-foreground hover:bg-success-soft/80"
          data-action-id="pos.ticket.abrir_whatsapp"
          nativeButton={false}
          render={
            <a href={whatsappHref} rel="noopener noreferrer" target="_blank" />
          }
          size="sm"
          variant="outline"
        >
          <MessageCircle aria-hidden="true" className="size-4 mr-1.5 text-success-soft-foreground" />
          Abrir WhatsApp
        </Button>
      </div>

      <ComprobanteImprimible {...props} />
      <TicketCapturaImagen {...props} capturaRef={capturaRef} />
    </>
  );
}
