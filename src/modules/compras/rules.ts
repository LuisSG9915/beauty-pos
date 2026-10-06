import type { CompraEstado } from "@/db/schema/compras";
import { formatCurrency, isValidDateInput } from "@/lib/format";
import { normalizarTexto } from "@/lib/ia/borrador";
import type { TicketCompraIa } from "@/lib/ia/esquemas";

/**
 * Post-proceso determinista del ticket leído por IA y reglas puras del ciclo
 * de vida de la compra (plan 10). Todo es función pura sin I/O para probarlo
 * en vitest y reutilizar el emparejamiento tanto en el route `analizar`
 * como en la UI (ordenar candidatos del combobox de producto).
 */

export type ProductoCatalogo = {
  id: string;
  nombre: string;
  sku: string | null;
  codigoBarras: string | null;
};

export type ProveedorCatalogo = { id: string; nombre: string };

/** Sugerencia de producto para una línea, ordenada por puntaje. */
export type CandidatoProducto = {
  productoId: string;
  nombre: string;
  puntaje: number;
};

/** Línea ya completa y emparejada, lista para insertar en `detalle_compras`. */
export type LineaCompraLista = {
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  importe: number;
  productoId: string | null;
};

const redondear2 = (valor: number) => Math.round(valor * 100) / 100;

// Umbrales del emparejamiento difuso (plan 10, cerrado): similitud Jaccard
// mínima y ventaja mínima sobre el segundo lugar para auto-emparejar.
const UMBRAL_JACCARD = 0.6;
const VENTAJA_MINIMA = 0.15;

/**
 * Tokens para comparar descripciones del ticket con nombres de producto:
 * minúsculas, sin acentos, sin tokens de 1 carácter y con número+unidad
 * unidos ("400 ml" → "400ml") para que el contenido pese como un solo token.
 */
export function tokensDescripcion(texto: string): Set<string> {
  const normalizado = normalizarTexto(texto).replace(/(\d)\s+([a-z])/g, "$1$2");
  return new Set(normalizado.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

/** Jaccard clásico: |A∩B| / |A∪B|; conjuntos vacíos → 0. */
export function puntajeJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let interseccion = 0;
  for (const token of a) if (b.has(token)) interseccion += 1;
  return interseccion / (a.size + b.size - interseccion);
}

/**
 * Completa costo/importe de una línea del ticket:
 * - falta `costoUnitario` y hay `importe` → `importe / cantidad` (2 decimales);
 * - falta `importe` y hay `costoUnitario` → `costoUnitario × cantidad`;
 * - faltan ambos, la descripción viene vacía o la cantidad no es válida →
 *   `null` (la línea se descarta y se reporta en `dudas`).
 */
export function completarLineaTicket(linea: {
  descripcion: string;
  cantidad: number;
  costoUnitario: number | null;
  importe: number | null;
}): Omit<LineaCompraLista, "productoId"> | null {
  const descripcion = linea.descripcion.trim();
  if (!descripcion || !Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
    return null;
  }
  let { costoUnitario, importe } = linea;
  if (costoUnitario === null && importe !== null) {
    costoUnitario = redondear2(importe / linea.cantidad);
  }
  if (importe === null && costoUnitario !== null) {
    importe = redondear2(costoUnitario * linea.cantidad);
  }
  if (costoUnitario === null || importe === null) return null;
  return {
    descripcion,
    cantidad: linea.cantidad,
    costoUnitario: redondear2(costoUnitario),
    importe: redondear2(importe),
  };
}

/**
 * Fecha leída del ticket: `null` cuando no es `AAAA-MM-DD` válida o queda en
 * el futuro respecto a `hoy` (fecha de la sucursal). El caller aplica el
 * default `?? hoy`.
 */
export function normalizarFechaTicket(fecha: string | null, hoy: string): string | null {
  if (!fecha || !isValidDateInput(fecha)) return null;
  return fecha <= hoy ? fecha : null;
}

/**
 * Empareja el proveedor leído con el catálogo de la organización por igualdad
 * normalizada (minúsculas, sin acentos). Devuelve el id o `null`.
 */
export function resolverProveedorId(
  nombreTicket: string | null,
  proveedores: ProveedorCatalogo[],
): string | null {
  const objetivo = nombreTicket ? normalizarTexto(nombreTicket) : "";
  if (!objetivo) return null;
  const encontrado = proveedores.find(
    (proveedor) => normalizarTexto(proveedor.nombre) === objetivo,
  );
  return encontrado?.id ?? null;
}

/**
 * Empareja una línea del ticket con el catálogo de productos activos:
 * 1. `codigo` igual a `codigo_barras` o `sku` → match exacto.
 * 2. Si no, Jaccard de tokens entre `descripcion` y `nombre`: auto-empareja
 *    cuando el mejor ≥ 0.6 y supera al segundo por ≥ 0.15 (empate → nada).
 * Devuelve además el top 3 de candidatos para que la persona elija en la UI.
 */
export function emparejarLineaProducto(
  linea: { descripcion: string; codigo?: string | null },
  productos: ProductoCatalogo[],
): { productoId: string | null; candidatos: CandidatoProducto[] } {
  const codigo = linea.codigo?.trim() || null;
  const porCodigo = codigo
    ? productos.find(
        (producto) => producto.codigoBarras === codigo || producto.sku === codigo,
      )
    : undefined;

  const tokens = tokensDescripcion(linea.descripcion);
  const puntuados = productos
    .map((producto) => ({
      productoId: producto.id,
      nombre: producto.nombre,
      puntaje: puntajeJaccard(tokens, tokensDescripcion(producto.nombre)),
    }))
    .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre))
    .slice(0, 3);

  const candidatos = (
    porCodigo
      ? [
          { productoId: porCodigo.id, nombre: porCodigo.nombre, puntaje: 1 },
          ...puntuados.filter((candidato) => candidato.productoId !== porCodigo.id),
        ]
      : puntuados
  ).slice(0, 3);

  const mejor = puntuados[0];
  const segundo = puntuados[1];
  const productoId = porCodigo
    ? porCodigo.id
    : mejor &&
        mejor.puntaje >= UMBRAL_JACCARD &&
        mejor.puntaje - (segundo?.puntaje ?? 0) >= VENTAJA_MINIMA
      ? mejor.productoId
      : null;

  return { productoId, candidatos };
}

/**
 * Salida del modelo ya validada → datos listos para persistir la compra.
 * `fechaCompra` nunca sale null: fecha inválida/futura cae a `hoy` (fecha de
 * la sucursal). Las líneas sin costo ni importe se descartan y se reportan en
 * `dudas` junto a las que devolvió el modelo.
 */
export function procesarTicketIa(
  salida: TicketCompraIa,
  params: {
    proveedores: ProveedorCatalogo[];
    productos: ProductoCatalogo[];
    hoy: string;
  },
): {
  proveedorId: string | null;
  proveedorTexto: string | null;
  folio: string | null;
  fechaCompra: string;
  totalTicket: number | null;
  lineas: LineaCompraLista[];
  dudas: string[];
} {
  const proveedorId = resolverProveedorId(salida.proveedor, params.proveedores);
  const dudas = [...salida.dudas];
  const lineas: LineaCompraLista[] = [];

  for (const linea of salida.lineas) {
    const completa = completarLineaTicket(linea);
    if (!completa) {
      dudas.push(
        `Renglón descartado: "${linea.descripcion.trim() || "sin descripción"}" no traía precio ni importe.`,
      );
      continue;
    }
    const { productoId } = emparejarLineaProducto(
      { descripcion: completa.descripcion, codigo: linea.codigo },
      params.productos,
    );
    lineas.push({ ...completa, productoId });
  }

  return {
    proveedorId,
    // Emparejado → proveedorId; si no, el texto leído queda como referencia.
    proveedorTexto: proveedorId ? null : salida.proveedor,
    folio: salida.folio,
    fechaCompra: normalizarFechaTicket(salida.fecha, params.hoy) ?? params.hoy,
    totalTicket: salida.total,
    lineas,
    dudas,
  };
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────

/** Estados en que las líneas y los datos de la compra pueden editarse. */
export const COMPRA_ESTADOS_EDITABLES: readonly CompraEstado[] = ["borrador", "por_verificar"];

/** Guard puro de edición: `null` si la compra acepta cambios de líneas/datos. */
export function errorEdicionCompra(estado: string): string | null {
  return COMPRA_ESTADOS_EDITABLES.includes(estado as CompraEstado)
    ? null
    : "La compra ya fue recibida o cancelada y no se puede editar.";
}

/**
 * Guard puro de recepción: `null` solo desde `por_verificar`. Es la
 * idempotencia de `recibirCompra`: tras la primera recepción el estado ya no
 * es `por_verificar`, así que un reintento se rechaza antes de tocar stock.
 */
export function errorRecepcionCompra(estado: string): string | null {
  if (estado === "por_verificar") return null;
  if (estado === "verificada" || estado === "con_observacion") {
    return "La compra ya fue recibida.";
  }
  if (estado === "cancelada") return "La compra está cancelada.";
  return "Primero agrega y revisa las líneas de la compra.";
}

/** Guard puro de "Marcar como verificada": solo desde `con_observacion`. */
export function errorResolucionCompra(estado: string): string | null {
  return estado === "con_observacion"
    ? null
    : "Solo las compras con observación se pueden marcar como verificadas.";
}

/** Guard puro de cancelación: `verificada` y `cancelada` son finales. */
export function errorCancelacionCompra(estado: string): string | null {
  return estado === "verificada" || estado === "cancelada"
    ? "La compra ya está cerrada."
    : null;
}

/**
 * Estado resultante al confirmar la recepción (plan 10):
 * - `con_observacion` si alguna línea recibió cantidad distinta o tiene nota,
 *   si la compra trae observaciones, o si el total del ticket difiere de la
 *   suma de las líneas por más de $1 — en ese caso `notaTotal` trae el texto
 *   exacto a anexar a `observaciones`.
 * - `verificada` cuando todo cuadra.
 */
export function estadoTrasRecibir(input: {
  lineas: { cantidad: number; cantidadRecibida: number; observacion?: string | null }[];
  observacionesCompra?: string | null;
  totalTicket?: number | null;
  totalCalculado?: number | null;
}): { estado: "verificada" | "con_observacion"; notaTotal: string | null } {
  let notaTotal: string | null = null;
  if (
    input.totalTicket != null &&
    input.totalCalculado != null &&
    Math.abs(input.totalTicket - input.totalCalculado) > 1
  ) {
    notaTotal = `El total del ticket (${formatCurrency(input.totalTicket)}) no coincide con la suma de las líneas (${formatCurrency(input.totalCalculado)}).`;
  }
  const hayDiferencia = input.lineas.some(
    (linea) =>
      linea.cantidadRecibida !== linea.cantidad || Boolean(linea.observacion?.trim()),
  );
  const estado =
    hayDiferencia || Boolean(input.observacionesCompra?.trim()) || notaTotal
      ? "con_observacion"
      : "verificada";
  return { estado, notaTotal };
}
