/**
 * Post-proceso determinista del borrador IA de producto (plan 08). Son
 * helpers puros sin dependencias de servidor para poder probarlos y
 * reutilizar el merge en el cliente (no pisar campos ya escritos).
 */

/** Largos de código de barras aceptados: EAN-8, UPC-A, EAN-13, GTIN-14. */
const LONGITUDES_CODIGO = new Set([8, 12, 13, 14]);

/**
 * Conserva solo dígitos y acepta 8, 12, 13 o 14 caracteres; cualquier otra
 * cosa → `null` (nunca arriesgar un código mal leído).
 */
export function normalizarCodigoBarras(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const digitos = valor.replace(/\D+/g, "");
  return LONGITUDES_CODIGO.has(digitos.length) ? digitos : null;
}

/** Minúsculas, sin acentos y con espacios colapsados — para comparar textos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Resuelve `categoriaSugerida` contra las categorías activas de la
 * organización: igualdad normalizada primero y, si no, inclusión en cualquier
 * dirección ("Tinte" ↔ "Tintes"). Sin coincidencia devuelve `null` y el texto
 * viaja como sugerencia para que la persona elija.
 */
export function resolverCategoriaId(
  sugerida: string | null,
  categorias: { id: string; nombre: string }[],
): string | null {
  const objetivo = sugerida ? normalizarTexto(sugerida) : "";
  if (!objetivo) return null;
  for (const categoria of categorias) {
    if (normalizarTexto(categoria.nombre) === objetivo) return categoria.id;
  }
  for (const categoria of categorias) {
    const nombre = normalizarTexto(categoria.nombre);
    if (nombre.includes(objetivo) || objetivo.includes(nombre)) {
      return categoria.id;
    }
  }
  return null;
}

/**
 * Compone el nombre del producto uniendo las partes (nombre + marca +
 * contenido) sin repetir palabras ya contenidas — p. ej. si la marca
 * "Elvive" ya venía en el nombre del empaque no se duplica.
 * Devuelve `null` cuando no queda nada.
 */
export function componerNombreSugerido(partes: (string | null)[]): string | null {
  const usados = new Set<string>();
  const salida: string[] = [];
  for (const parte of partes) {
    if (!parte) continue;
    const nuevas: string[] = [];
    for (const palabra of parte.trim().split(/\s+/)) {
      const token = normalizarTexto(palabra);
      if (!token || usados.has(token)) continue;
      usados.add(token);
      nuevas.push(palabra);
    }
    if (nuevas.length > 0) salida.push(nuevas.join(" "));
  }
  return salida.length > 0 ? salida.join(" ") : null;
}

/**
 * Merge del borrador sobre lo que ya escribió la persona: solo rellena los
 * campos VACÍOS — jamás pisa texto capturado a mano. Devuelve los valores
 * resultantes y qué campos se rellenaron (`aplicados`).
 */
export function fusionarBorrador<T extends Record<string, string>>(
  actual: T,
  propuestas: Partial<Record<keyof T, string | null>>,
): { valores: T; aplicados: (keyof T)[] } {
  const valores = { ...actual };
  const aplicados: (keyof T)[] = [];
  for (const campo of Object.keys(propuestas) as (keyof T)[]) {
    const propuesta = propuestas[campo];
    if (propuesta && !(actual[campo] ?? "").trim()) {
      valores[campo] = propuesta as T[keyof T];
      aplicados.push(campo);
    }
  }
  return { valores, aplicados };
}

/**
 * Campos de IA (`camposDudosos`) → campos del formulario de producto.
 * `marca`/`contenido` no son campos propios del form: se funden en `nombre`
 * vía `nombreSugerido`, así que la duda se marca ahí.
 */
export const CAMPO_FORM_POR_CAMPO_IA: Record<string, string> = {
  nombre: "nombre",
  marca: "nombre",
  contenido: "nombre",
  descripcion: "descripcion",
  codigoBarras: "codigoBarras",
  categoriaSugerida: "categoriaId",
  precioEtiqueta: "precioVenta",
};

/** Respuesta 200 de `POST /api/ia/producto` (contrato del plan 08). */
export type CapturaProductoRespuesta = {
  nombre: string | null;
  /** nombre + marca + contenido compuestos sin repetir palabras. */
  nombreSugerido: string | null;
  marca: string | null;
  contenido: string | null;
  descripcion: string | null;
  codigoBarras: string | null;
  categoriaId: string | null;
  categoriaSugerida: string | null;
  precioEtiqueta: number | null;
  camposDudosos: string[];
  duplicado: { id: string; nombre: string } | null;
};
