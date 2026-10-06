import { z } from "zod";

/**
 * Prompt y esquema de salida de la captura de producto desde foto (plan 08 —
 * diseño cerrado: NO modificar el prompt ni el schema sin revisión).
 * El zod espejo valida la respuesta del modelo; el route handler hace el
 * post-proceso determinista encima (ver `src/app/api/ia/producto/route.ts`).
 */

/** Modelo de Workers AI para la captura (visión + `response_format` JSON). */
export const MODELO_CAPTURA_PRODUCTO = "@cf/meta/llama-4-scout-17b-16e-instruct";

export const IA_SISTEMA_PRODUCTO =
  "Eres un asistente que lee fotografías de productos de belleza y cuidado personal (shampoo, tintes, cremas, esmaltes, herramientas) para un punto de venta de un salón en México. Respondes solo con JSON válido que cumpla el esquema. Si un dato no se ve con claridad en la foto, devuelve null: nunca inventes ni adivines marcas, contenidos, códigos o precios. Escribe en español de México, con mayúscula inicial y sin texto promocional.";

export const IA_INSTRUCCION_PRODUCTO = `Extrae de la foto:
- nombre: tipo de producto y variante tal como aparece (ej. "Shampoo reparador"), sin la marca.
- marca: la marca comercial visible.
- contenido: cantidad neta con su unidad (ej. "400 ml", "60 g", "1 pieza").
- descripcion: una frase corta (máx. 120 caracteres) con el uso principal, solo si está escrito en el empaque.
- codigoBarras: los dígitos impresos bajo el código de barras, sin espacios.
- categoriaSugerida: una de estas palabras si aplica: Shampoo, Acondicionador, Tratamiento, Tinte, Decolorante, Peinado, Uñas, Piel, Herramienta, Accesorio, Otro.
- precioEtiqueta: el precio en pesos solo si hay una etiqueta de precio visible; número sin signo.
- camposDudosos: nombres de los campos que llenaste pero que no se leían con total claridad.`;

export const IA_JSON_SCHEMA_PRODUCTO: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "nombre",
    "marca",
    "contenido",
    "descripcion",
    "codigoBarras",
    "categoriaSugerida",
    "precioEtiqueta",
    "camposDudosos",
  ],
  properties: {
    nombre: { type: ["string", "null"], maxLength: 120 },
    marca: { type: ["string", "null"], maxLength: 80 },
    contenido: { type: ["string", "null"], maxLength: 40 },
    descripcion: { type: ["string", "null"], maxLength: 160 },
    codigoBarras: { type: ["string", "null"], maxLength: 20 },
    categoriaSugerida: { type: ["string", "null"], maxLength: 40 },
    precioEtiqueta: { type: ["number", "null"], minimum: 0 },
    camposDudosos: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
};

/** String acotado y nullable que además recorta y convierte "" en null. */
const textoOpcional = (largo: number) =>
  z
    .string()
    .max(largo)
    .nullable()
    .transform((texto) => texto?.trim() || null);

/**
 * Espejo estricto de `IA_JSON_SCHEMA_PRODUCTO` (mismos campos y topes;
 * `additionalProperties: false` → `strictObject`). Nombres en camelCase igual
 * que el JSON schema — el contrato con el modelo está en inglés de campos.
 */
export const borradorProductoIaSchema = z.strictObject({
  nombre: textoOpcional(120),
  marca: textoOpcional(80),
  contenido: textoOpcional(40),
  descripcion: textoOpcional(160),
  codigoBarras: textoOpcional(20),
  categoriaSugerida: textoOpcional(40),
  precioEtiqueta: z.number().min(0).nullable(),
  camposDudosos: z.array(z.string()).max(8),
});

/** Respuesta ya validada del modelo para una foto de producto. */
export type BorradorProductoIa = z.infer<typeof borradorProductoIaSchema>;

/**
 * Lectura de ticket de compra a proveedor (plan 10 — diseño cerrado: NO
 * modificar el prompt ni el schema sin revisión). Mismo modelo de visión que
 * la captura de producto; `max_tokens` sube a 1500 porque un ticket puede
 * traer hasta 60 renglones.
 */
export const MODELO_LECTURA_TICKET = MODELO_CAPTURA_PRODUCTO;
export const IA_MAX_TOKENS_TICKET = 1500;

export const IA_SISTEMA_TICKET =
  "Eres un asistente que lee fotografías de tickets y notas de compra de proveedores de productos de belleza en México. Respondes solo con JSON válido que cumpla el esquema. Copia los textos tal como aparecen; si un dato no se lee con claridad devuelve null y nunca inventes renglones, cantidades ni importes. Los importes están en pesos mexicanos.";

export const IA_INSTRUCCION_TICKET = `Lee el ticket y extrae:
- proveedor: nombre comercial del negocio que vende.
- folio: número de ticket, nota o factura.
- fecha: fecha de la compra en formato AAAA-MM-DD.
- total: total final pagado.
- lineas: un elemento por cada producto comprado, en el orden del ticket, con:
  - descripcion: texto del renglón tal como aparece.
  - cantidad: número de piezas o unidades (1 si no se indica).
  - costoUnitario: precio por unidad; si solo hay importe, divídelo entre la cantidad.
  - importe: importe del renglón.
  - codigo: código o SKU del renglón si aparece.
No incluyas como líneas los subtotales, impuestos, descuentos globales, cambio ni forma de pago.
- dudas: renglones o datos que no pudiste leer bien, en texto breve.`;

export const IA_JSON_SCHEMA_TICKET: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["proveedor", "folio", "fecha", "total", "lineas", "dudas"],
  properties: {
    proveedor: { type: ["string", "null"], maxLength: 160 },
    folio: { type: ["string", "null"], maxLength: 80 },
    fecha: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    total: { type: ["number", "null"], minimum: 0 },
    lineas: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descripcion", "cantidad", "costoUnitario", "importe", "codigo"],
        properties: {
          descripcion: { type: "string", maxLength: 240 },
          cantidad: { type: "number", exclusiveMinimum: 0 },
          costoUnitario: { type: ["number", "null"], minimum: 0 },
          importe: { type: ["number", "null"], minimum: 0 },
          codigo: { type: ["string", "null"], maxLength: 40 },
        },
      },
    },
    dudas: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 10,
    },
  },
};

/**
 * Espejo estricto de `IA_JSON_SCHEMA_TICKET` (`additionalProperties: false` →
 * `strictObject`). `fecha` replica el patrón AAAA-MM-DD del JSON schema; la
 * validez real (fecha existente, no futura) la decide el post-proceso.
 */
export const ticketCompraIaSchema = z.strictObject({
  proveedor: textoOpcional(160),
  folio: textoOpcional(80),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  total: z.number().min(0).nullable(),
  lineas: z
    .array(
      z.strictObject({
        descripcion: z.string().max(240),
        cantidad: z.number().gt(0),
        costoUnitario: z.number().min(0).nullable(),
        importe: z.number().min(0).nullable(),
        codigo: textoOpcional(40),
      }),
    )
    .max(60),
  dudas: z.array(z.string().max(200)).max(10),
});

/** Respuesta ya validada del modelo para una foto de ticket de compra. */
export type TicketCompraIa = z.infer<typeof ticketCompraIaSchema>;

/**
 * Resumen en lenguaje natural del reporte "Qué comprar" (plan 12 — diseño
 * cerrado: NO modificar el prompt ni el schema sin revisión). La IA solo
 * redacta: los números llegan calculados en el JSON de entrada y cualquier
 * punto que mencione un número ausente se descarta en el post-proceso
 * (`filtrarPuntosResumen` en `src/modules/reportes/reabastecimiento.ts`).
 */
export const MODELO_RESUMEN_TEXTO = "@cf/meta/llama-3.1-8b-instruct-fp8";

export const IA_SISTEMA_REABASTO =
  "Eres un asesor de compras para un salón de belleza en México. Recibes datos ya calculados y escribes un resumen breve, claro y práctico para la recepcionista. Usa solo los números que recibes, sin recalcular ni inventar productos o cantidades. Español de México, sin tecnicismos.";

/** Instrucción exacta del plan; `datosJson` es el JSON determinista de entrada. */
export const iaInstruccionReabasto = (datosJson: string) =>
  `Con estos datos escribe:
- puntos: de 3 a 5 frases cortas (máx. 160 caracteres cada una) que digan qué comprar primero y por qué, qué producto conviene impulsar por su ganancia y qué mercancía está detenida.
Datos: ${datosJson}`;

export const IA_JSON_SCHEMA_REABASTO: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["puntos"],
  properties: {
    puntos: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string", maxLength: 200 },
    },
  },
};

/** Espejo estricto de `IA_JSON_SCHEMA_REABASTO`. */
export const resumenReabastoIaSchema = z.strictObject({
  puntos: z.array(z.string().max(200)).min(1).max(5),
});

export type ResumenReabastoIa = z.infer<typeof resumenReabastoIaSchema>;
