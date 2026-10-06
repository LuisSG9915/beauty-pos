/**
 * Plan 12 — "Qué comprar" (reabastecimiento) y "buena compra".
 *
 * Todas las funciones son puras y deterministas: el reporte entero se calcula
 * aquí a partir de las filas crudas de `reabastecimiento-queries.ts`. La IA
 * solo redacta un resumen sobre `EntradaResumenReabasto` y se valida con
 * `filtrarPuntosResumen` — nunca calcula cantidades.
 *
 * Fórmulas (cerradas por el plan; NO cambiar umbrales sin revisión):
 *
 *   dias30 = min(30, max(7, creadoHaceDias))
 *   dias90 = min(90, max(7, creadoHaceDias))
 *   v30 = salidas30 / dias30
 *   v90 = salidas90 / dias90
 *   v   = 0.6·v30 + 0.4·v90
 *   tendencia = v90 = 0 ? (v30 > 0 ? "nuevo" : "sin_ventas")
 *             : v30/v90 > 1.25 ? "subiendo" : v30/v90 < 0.75 ? "bajando" : "estable"
 *   cobertura = v > 0 ? stock / v : null
 *   sugerido  = max(0, ceil(v·N + stockMinimo − stock − enCamino))
 *   prioridad = stock ≤ 0 && v > 0                    → "agotado"
 *             : cobertura !== null && cobertura < 7   → "urgente"
 *             : cobertura !== null && cobertura < N   → "pronto"
 *             : sugerido > 0                          → "minimo"
 *             : "ok"
 *   costoSugerido = sugerido · costo
 */

// ── Parámetros cerrados del plan ─────────────────────────────────────────────

export const REABASTO_DIAS_MIN = 7;
export const REABASTO_DIAS_MAX = 60;
export const REABASTO_DIAS_DEFAULT = 14;
export const REABASTO_VENTANA_CORTA = 30;
export const REABASTO_VENTANA_LARGA = 90;

/** Piso de días de antigüedad del producto al estimar velocidad (plan). */
const PISO_DIAS_ACTIVO = 7;
/** Cobertura < 7 días marca la fila como "urgente" (no depende de N). */
const UMBRAL_URGENTE_DIAS = 7;
const UMBRAL_TENDENCIA_SUBE = 1.25;
const UMBRAL_TENDENCIA_BAJA = 0.75;
/** Peso de la ventana corta en la velocidad mezclada (0.6·v30 + 0.4·v90). */
const PESO_VENTANA_CORTA = 0.6;

export const PRIORIDADES_REABASTO = ["agotado", "urgente", "pronto", "minimo", "ok"] as const;
export type PrioridadReabasto = (typeof PRIORIDADES_REABASTO)[number];

export const TENDENCIAS_REABASTO = ["subiendo", "estable", "bajando", "nuevo", "sin_ventas"] as const;
export type TendenciaReabasto = (typeof TENDENCIAS_REABASTO)[number];

const ORDEN_PRIORIDAD: Record<PrioridadReabasto, number> = {
  agotado: 0,
  urgente: 1,
  pronto: 2,
  minimo: 3,
  ok: 4,
};

/** Vocabulario visible (compartido por la página, el panel y la gráfica). */
export const PRIORIDAD_REABASTO_LABEL: Record<PrioridadReabasto, string> = {
  agotado: "Agotado",
  urgente: "Urgente",
  pronto: "Pronto",
  minimo: "Mínimo",
  ok: "Cubierto",
};

export const TENDENCIA_REABASTO_LABEL: Record<TendenciaReabasto, string> = {
  subiendo: "↑ subiendo",
  estable: "→ pareja",
  bajando: "↓ bajando",
  nuevo: "✦ nuevo",
  sin_ventas: "sin ventas",
};

// ── Normalización del parámetro N ────────────────────────────────────────────

/**
 * Días a cubrir: 7–60, default 14. Cualquier valor inválido (NaN, fuera de
 * rango) cae al rango; se redondea al entero más cercano porque el reporte
 * trabaja en días enteros.
 */
export function normalizarDiasObjetivo(valor: number | string | null | undefined): number {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (numero === null || numero === undefined || !Number.isFinite(numero)) {
    return REABASTO_DIAS_DEFAULT;
  }
  const redondeado = Math.round(numero);
  return Math.min(REABASTO_DIAS_MAX, Math.max(REABASTO_DIAS_MIN, redondeado));
}

// ── Cálculo por producto ─────────────────────────────────────────────────────

/** Fila cruda que trae la consulta fusionada (números ya coercionados). */
export type EntradaReabasto = {
  productoId: string;
  nombre: string;
  sku: string | null;
  tipo: string;
  stock: number;
  stockMinimo: number;
  costo: number;
  precioVenta: number;
  /** Días desde el alta del producto; el piso de 7 evita velocidades falsas. */
  creadoHaceDias: number;
  /** Salidas netas (venta+consumo−devolución) de los últimos 30 días. */
  salidas30: number;
  /** Salidas netas de los últimos 90 días. */
  salidas90: number;
  /** Piezas pedidas a proveedor en compras borrador/por_verificar. */
  enCamino: number;
};

/** Fila tal como la devuelve `reabastecimiento-queries.ts` (snake_case de SQL). */
export type FilaCrudaReabasto = {
  producto_id: string;
  nombre: string;
  sku: string | null;
  tipo: string;
  costo: number | string;
  precio_venta: number | string;
  stock_minimo: number | string;
  stock: number | string;
  salidas30: number | string;
  salidas90: number | string;
  en_camino: number | string;
  creado_at: string | Date;
};

/**
 * Convierte la fila cruda de la consulta en la entrada de la fórmula: coerciona
 * los numéricos del driver y deriva `creadoHaceDias` contra `ahora` (los
 * productos recién dados de alta tienen piso de 7 días dentro de la fórmula).
 */
export function filaCrudaAEntrada(row: FilaCrudaReabasto, ahora: Date): EntradaReabasto {
  const creadoAt = row.creado_at instanceof Date ? row.creado_at : new Date(row.creado_at);
  const creadoHaceDias = Number.isNaN(creadoAt.getTime())
    ? 0
    : Math.max(0, Math.floor((ahora.getTime() - creadoAt.getTime()) / 86_400_000));
  return {
    productoId: row.producto_id,
    nombre: row.nombre,
    sku: row.sku,
    tipo: row.tipo,
    stock: Number(row.stock ?? 0),
    stockMinimo: Number(row.stock_minimo ?? 0),
    costo: Number(row.costo ?? 0),
    precioVenta: Number(row.precio_venta ?? 0),
    creadoHaceDias,
    salidas30: Number(row.salidas30 ?? 0),
    salidas90: Number(row.salidas90 ?? 0),
    enCamino: Number(row.en_camino ?? 0),
  };
}

export type FilaReabasto = EntradaReabasto & {
  /** Velocidad ventana 30 días (unidades/día). */
  v30: number;
  /** Velocidad ventana 90 días (unidades/día). */
  v90: number;
  /** Velocidad mezclada 0.6·v30 + 0.4·v90. */
  v: number;
  tendencia: TendenciaReabasto;
  /** Días que alcanza el stock al ritmo `v`; null cuando no hay demanda. */
  cobertura: number | null;
  /** Piezas sugeridas de compra (ceil, nunca negativo). */
  sugerido: number;
  prioridad: PrioridadReabasto;
  costoSugerido: number;
};

export function calcularFilaReabasto(entrada: EntradaReabasto, diasObjetivo: number): FilaReabasto {
  const dias = normalizarDiasObjetivo(diasObjetivo);
  const dias30 = Math.min(REABASTO_VENTANA_CORTA, Math.max(PISO_DIAS_ACTIVO, entrada.creadoHaceDias));
  const dias90 = Math.min(REABASTO_VENTANA_LARGA, Math.max(PISO_DIAS_ACTIVO, entrada.creadoHaceDias));
  const v30 = entrada.salidas30 / dias30;
  const v90 = entrada.salidas90 / dias90;
  const v = PESO_VENTANA_CORTA * v30 + (1 - PESO_VENTANA_CORTA) * v90;

  const tendencia: TendenciaReabasto =
    v90 === 0
      ? v30 > 0
        ? "nuevo"
        : "sin_ventas"
      : v30 / v90 > UMBRAL_TENDENCIA_SUBE
        ? "subiendo"
        : v30 / v90 < UMBRAL_TENDENCIA_BAJA
          ? "bajando"
          : "estable";

  const cobertura = v > 0 ? entrada.stock / v : null;
  const sugerido = Math.max(
    0,
    Math.ceil(v * dias + entrada.stockMinimo - entrada.stock - entrada.enCamino),
  );

  const prioridad: PrioridadReabasto =
    entrada.stock <= 0 && v > 0
      ? "agotado"
      : cobertura !== null && cobertura < UMBRAL_URGENTE_DIAS
        ? "urgente"
        : cobertura !== null && cobertura < dias
          ? "pronto"
          : sugerido > 0
            ? "minimo"
            : "ok";

  return {
    ...entrada,
    v30,
    v90,
    v,
    tendencia,
    cobertura,
    sugerido,
    prioridad,
    costoSugerido: sugerido * entrada.costo,
  };
}

// ── Resultado completo del reporte ───────────────────────────────────────────

export type BuenaCompra = {
  productoId: string;
  nombre: string;
  sku: string | null;
  margenUnitario: number;
  /** v · 30 · margenUnitario — es también el `score` de orden. */
  utilidadMensual: number;
  /** margenUnitario / precioVenta (0–1). */
  margenPct: number;
  /** Piezas que se venden al mes al ritmo actual (v·30). */
  vendePorMes: number;
};

export type CapitalDetenido = {
  productoId: string;
  nombre: string;
  sku: string | null;
  stock: number;
  costo: number;
  /** stock · costo — dinero detenido en ese producto. */
  capital: number;
};

export type ResultadoReabasto = {
  /** Días a cubrir ya normalizados (7–60). */
  dias: number;
  /** Todas las filas calculadas, en el orden de entrada. */
  filas: FilaReabasto[];
  /** prioridad ≠ "ok", orden: agotado → urgente → pronto → minimo, cobertura asc. */
  sugerencias: FilaReabasto[];
  /** Top 10 por utilidad mensual esperada (solo retail con margen > 0). */
  buenaCompra: BuenaCompra[];
  /** Top 10 por capital detenido (sin ventas en 90 días, con stock). */
  detenida: CapitalDetenido[];
  kpis: {
    /** Filas de la lista de compra con prioridad "agotado". */
    agotados: number;
    urgentes: number;
    costoTotalSugerido: number;
  };
};

function compararNombre(a: string, b: string): number {
  return a.localeCompare(b, "es-MX");
}

function ordenarSugerencias(a: FilaReabasto, b: FilaReabasto): number {
  const porPrioridad = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad];
  if (porPrioridad !== 0) return porPrioridad;
  const coberturaA = a.cobertura ?? Number.POSITIVE_INFINITY;
  const coberturaB = b.cobertura ?? Number.POSITIVE_INFINITY;
  if (coberturaA !== coberturaB) return coberturaA - coberturaB;
  return compararNombre(a.nombre, b.nombre);
}

export function calcularReabastecimiento(
  entradas: readonly EntradaReabasto[],
  diasObjetivo: number,
): ResultadoReabasto {
  const dias = normalizarDiasObjetivo(diasObjetivo);
  const filas = entradas.map((entrada) => calcularFilaReabasto(entrada, dias));

  const sugerencias = filas
    .filter((fila) => fila.prioridad !== "ok")
    .sort(ordenarSugerencias);

  const buenaCompra = filas
    .filter(
      (fila) =>
        (fila.tipo === "producto" || fila.tipo === "ambos") &&
        fila.precioVenta > 0 &&
        fila.v > 0 &&
        fila.precioVenta - fila.costo > 0,
    )
    .map((fila) => {
      const margenUnitario = fila.precioVenta - fila.costo;
      return {
        productoId: fila.productoId,
        nombre: fila.nombre,
        sku: fila.sku,
        margenUnitario,
        utilidadMensual: fila.v * 30 * margenUnitario,
        margenPct: margenUnitario / fila.precioVenta,
        vendePorMes: fila.v * 30,
      };
    })
    .sort(
      (a, b) => b.utilidadMensual - a.utilidadMensual || compararNombre(a.nombre, b.nombre),
    )
    .slice(0, 10);

  const detenida = filas
    .filter((fila) => fila.salidas90 === 0 && fila.stock > 0)
    .map((fila) => ({
      productoId: fila.productoId,
      nombre: fila.nombre,
      sku: fila.sku,
      stock: fila.stock,
      costo: fila.costo,
      capital: fila.stock * fila.costo,
    }))
    .sort((a, b) => b.capital - a.capital || compararNombre(a.nombre, b.nombre))
    .slice(0, 10);

  return {
    dias,
    filas,
    sugerencias,
    buenaCompra,
    detenida,
    kpis: {
      agotados: sugerencias.filter((fila) => fila.prioridad === "agotado").length,
      urgentes: sugerencias.filter((fila) => fila.prioridad === "urgente").length,
      costoTotalSugerido: sugerencias.reduce((total, fila) => total + fila.costoSugerido, 0),
    },
  };
}

// ── Textos legibles (deterministas) ──────────────────────────────────────────

const redondear1 = (valor: number) => Math.round(valor * 10) / 10;

/** Motivo corto de por qué la fila aparece en la lista de compra. */
export function motivoFilaReabasto(fila: FilaReabasto, diasObjetivo: number): string {
  const dias = normalizarDiasObjetivo(diasObjetivo);
  switch (fila.prioridad) {
    case "agotado":
      return "Sin existencias y se sigue vendiendo.";
    case "urgente":
      return `Quedan ~${redondear1(fila.cobertura ?? 0)} días de stock.`;
    case "pronto":
      return `Alcanza para ~${redondear1(fila.cobertura ?? 0)} días; el objetivo es ${dias}.`;
    case "minimo":
      return `Solo para cubrir el mínimo (${redondear1(fila.stockMinimo)}).`;
    default:
      return "Cubierto.";
  }
}

/** Texto exacto del plan para cada fila de "Buena compra". */
export function textoBuenaCompra(item: BuenaCompra, fmt: (valor: number) => string): string {
  return `Se vende ~${Math.round(item.vendePorMes)} al mes y deja ${fmt(item.margenUnitario)} por pieza (≈ ${fmt(item.utilidadMensual)} al mes).`;
}

/** Texto exacto del plan para cada fila de "Mercancía detenida". */
export function textoCapitalDetenido(item: CapitalDetenido, fmt: (valor: number) => string): string {
  return `Sin ventas en 90 días; tienes ${fmt(item.capital)} detenidos.`;
}

// ── Entrada acotada para el resumen IA ───────────────────────────────────────

export type EntradaResumenReabasto = {
  dias: number;
  moneda: string;
  comprar: {
    nombre: string;
    stock: number;
    vendePorDia: number;
    diasQueAlcanza: number | null;
    sugerido: number;
    prioridad: PrioridadReabasto;
    tendencia: TendenciaReabasto;
  }[];
  buenaCompra: { nombre: string; utilidadMensual: number; margenPct: number }[];
  detenida: { nombre: string; capitalDetenido: number }[];
};

/**
 * Construye el JSON que se envía al modelo: top 10 de "Qué comprar", top 5 de
 * "Buena compra" y top 5 de "Detenida", más `{dias, moneda}`. Los números se
 * redondean antes de salir para que lo que ve el modelo coincida con la
 * pantalla (vende/día a 1 decimal, importes a enteros).
 */
export function construirEntradaResumen(
  resultado: ResultadoReabasto,
  opciones: { moneda: string },
): EntradaResumenReabasto {
  return {
    dias: resultado.dias,
    moneda: opciones.moneda,
    comprar: resultado.sugerencias.slice(0, 10).map((fila) => ({
      nombre: fila.nombre,
      stock: Math.round(fila.stock * 1000) / 1000,
      vendePorDia: redondear1(fila.v),
      diasQueAlcanza: fila.cobertura === null ? null : redondear1(fila.cobertura),
      sugerido: fila.sugerido,
      prioridad: fila.prioridad,
      tendencia: fila.tendencia,
    })),
    buenaCompra: resultado.buenaCompra.slice(0, 5).map((item) => ({
      nombre: item.nombre,
      utilidadMensual: Math.round(item.utilidadMensual),
      margenPct: Math.round(item.margenPct * 100),
    })),
    detenida: resultado.detenida.slice(0, 5).map((item) => ({
      nombre: item.nombre,
      capitalDetenido: Math.round(item.capital),
    })),
  };
}

// ── Validación de fidelidad del resumen IA ───────────────────────────────────

/**
 * Enteros o decimales con punto, con separador de miles opcional (`1,234.5`,
 * `1,234`, `1234.5`, `1234`). No acepta coma decimal: en es-MX el separador
 * decimal es el punto y `$12,50` no es un formato que produzca la app.
 */
const NUMERO_EN_TEXTO_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

export function numerosEnTexto(texto: string): number[] {
  return (texto.match(NUMERO_EN_TEXTO_RE) ?? [])
    .map((coincidencia) => Number(coincidencia.replace(/,/g, "")))
    .filter(Number.isFinite);
}

/**
 * Conjunto de números que el resumen puede mencionar con fidelidad: cada hoja
 * numérica del JSON de entrada más sus redondeos a entero, 1 y 2 decimales
 * (el modelo puede escribir "0.9" o "1" para `vendePorDia: 0.87`).
 */
export function numerosPermitidos(entrada: unknown): Set<number> {
  const permitidos = new Set<number>();
  const caminar = (valor: unknown) => {
    if (typeof valor === "number") {
      if (!Number.isFinite(valor)) return;
      permitidos.add(valor);
      permitidos.add(Math.round(valor));
      permitidos.add(redondear1(valor));
      permitidos.add(Math.round(valor * 100) / 100);
      return;
    }
    if (typeof valor === "string") {
      // Los números dentro de nombres ("Tinte 9.1", "Shampoo 400 ml") sí
      // aparecen en el JSON de entrada: citarlos en el resumen es fiel.
      for (const numero of numerosEnTexto(valor)) permitidos.add(numero);
      return;
    }
    if (Array.isArray(valor)) {
      for (const item of valor) caminar(item);
      return;
    }
    if (valor !== null && typeof valor === "object") {
      for (const item of Object.values(valor)) caminar(item);
    }
  };
  caminar(entrada);
  return permitidos;
}

/** true si TODO número del texto aparece (con tolerancia) en el set permitido. */
export function puntoFielALosDatos(punto: string, permitidos: ReadonlySet<number>): boolean {
  const tolerancia = 1e-9;
  return numerosEnTexto(punto).every((numero) =>
    [...permitidos].some((permitido) => Math.abs(permitido - numero) <= tolerancia),
  );
}

/**
 * Descarta los puntos del modelo que mencionen un número ausente del JSON de
 * entrada. Lo que queda se puede mostrar; si queda vacío la UI muestra
 * "No se pudo generar el resumen.".
 */
export function filtrarPuntosResumen(
  puntos: readonly string[],
  entrada: unknown,
): string[] {
  const permitidos = numerosPermitidos(entrada);
  return puntos.filter((punto) => puntoFielALosDatos(punto, permitidos));
}

// ── Clave de caché ───────────────────────────────────────────────────────────

/**
 * Hash FNV-1a de 32 bits en hex (8 caracteres). Determinista, sin costo
 * criptográfico: solo sirve para distinguir el JSON de entrada en la clave KV.
 */
export function hash8(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
