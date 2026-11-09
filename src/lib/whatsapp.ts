import { formatCurrency, formatDate, formatTime } from "@/lib/format";

/**
 * Utilidades de WhatsApp (`wa.me`): normalización de teléfonos y armado del
 * mensaje/enlace del ticket. Módulo puro — lo usan el POS, la ficha de
 * clienta y los recordatorios de expediente.
 *
 * `wa.me` solo admite texto prellenado; la imagen del ticket viaja por
 * `navigator.share({ files })` en el teléfono o portapapeles + pegado manual
 * en WhatsApp Web (ver `printable-ticket.tsx`).
 */

/**
 * Normaliza un teléfono a formato internacional para `wa.me` (solo dígitos,
 * con código de país). Reglas:
 * - quita `+`, espacios, guiones y el prefijo `00`;
 * - México: quita `044`/`045` (nacional antiguo) y el `1` de `521…`
 *   (móvil con "1"); 10 dígitos → antepone `52`;
 * - devuelve `null` si no queda un número válido (8–15 dígitos).
 */
export function normalizarTelefonoWhatsApp(
  telefono: string | null | undefined,
): string | null {
  if (!telefono) return null;
  let digitos = telefono.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  // México: prefijo nacional 044/045 seguido del número de 10 dígitos.
  if ((digitos.startsWith("044") || digitos.startsWith("045")) && digitos.length === 13) {
    digitos = digitos.slice(3);
  }
  // México: +52 1 … (13 dígitos) → el "1" ya no se usa en wa.me.
  if (digitos.startsWith("521") && digitos.length === 13) {
    digitos = `52${digitos.slice(3)}`;
  }
  // México: número local de 10 dígitos → +52.
  if (digitos.length === 10) digitos = `52${digitos}`;
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/**
 * Enlace `wa.me` con texto prellenado. Sin teléfono válido queda
 * `https://wa.me/?text=…` (WhatsApp pide elegir el chat).
 */
export function enlaceWhatsApp(opciones: {
  telefono?: string | null;
  texto?: string;
}): string {
  const numero = normalizarTelefonoWhatsApp(opciones.telefono);
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  const texto = opciones.texto?.trim();
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export type LineaTicketWhatsApp = {
  nombre: string;
  cantidad: number;
};

/**
 * Mensaje llano del ticket para WhatsApp: negocio, fecha del cobro, cliente
 * opcional, conceptos, total y formas de pago. Sin rutas internas ni
 * identificadores visibles (el folio consecutivo llega con la misión 77b).
 */
export function textoTicketWhatsApp(opciones: {
  negocio: string;
  fecha?: Date | string | null;
  cliente?: string | null;
  lineas: LineaTicketWhatsApp[];
  total: string;
  pagos?: Array<{ nombre: string; monto: string }> | null;
  moneda: string;
  preliminar?: boolean;
}): string {
  const conceptos = opciones.lineas.map(
    (l) => `${l.cantidad > 1 ? `${l.cantidad}x ` : ""}${l.nombre}`,
  );
  const pagos = (opciones.pagos ?? [])
    .map((p) => `${p.nombre} ${formatCurrency(p.monto, { currency: opciones.moneda })}`)
    .join(" · ");
  return [
    `*${opciones.negocio}* · Ticket de venta${opciones.preliminar ? " (preliminar)" : ""}`,
    opciones.fecha ? `${formatDate(opciones.fecha)} · ${formatTime(opciones.fecha)}` : null,
    opciones.cliente ? `Cliente: ${opciones.cliente}` : null,
    conceptos.length > 0 ? `Conceptos: ${conceptos.join(", ")}` : null,
    `Total: ${formatCurrency(opciones.total, { currency: opciones.moneda })}`,
    pagos ? `Pago: ${pagos}` : null,
    "¡Gracias por tu preferencia! Te esperamos pronto.",
  ]
    .filter(Boolean)
    .join("\n");
}
