/**
 * Reglas puras del dominio Plano del salón. Sin acceso a base de datos ni
 * efectos: toda entrada sale del caller, lo que las hace testeables de forma
 * aislada (mismo enfoque que `src/modules/agenda/rules.ts`).
 *
 * El plano es una cuadrícula por piso: coordenadas y tamaños en celdas
 * enteras. Los rectángulos son semiabiertos `[x, x+ancho) × [y, y+alto)`:
 * tocarse en el borde NO es encimarse.
 */

/** Rectángulo en celdas enteras dentro de la cuadrícula del piso. */
export interface PlanoRect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Elemento colocado en el piso (ubicación o mueble): rectángulo + id. */
export interface ElementoPlano extends PlanoRect {
  id: string;
}

export type CodigoViolacionPlano = "fuera_de_piso" | "encimado" | "tamano_invalido";

export interface ViolacionPlano {
  codigo: CodigoViolacionPlano;
  mensaje: string;
  /** Elemento con el que se encima, cuando aplica. */
  conflictoId?: string;
}

/** Solape de rectángulos semiabiertos: tocarse en el borde NO es traslape. */
export function rectsOverlap(a: PlanoRect, b: PlanoRect): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;
}

/**
 * El rectángulo cabe completo en la cuadrícula: coordenadas enteras, origen
 * dentro del piso y tamaño mínimo 1×1 celda sin salirse por la derecha/abajo.
 */
export function cabeEnPiso(rect: PlanoRect, columnas: number, filas: number): boolean {
  return (
    Number.isInteger(rect.x) &&
    Number.isInteger(rect.y) &&
    Number.isInteger(rect.ancho) &&
    Number.isInteger(rect.alto) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.ancho >= 1 &&
    rect.alto >= 1 &&
    rect.x + rect.ancho <= columnas &&
    rect.y + rect.alto <= filas
  );
}

/**
 * Valida colocar `rect` en un piso de `columnas` × `filas` junto a los demás
 * `elementos` activos (ubicaciones y mobiliario juntos — comparten el plano).
 * `ignorarId` excluye al elemento que se está moviendo/redimensionando.
 */
export function validarColocacion(params: {
  rect: PlanoRect;
  columnas: number;
  filas: number;
  elementos: readonly ElementoPlano[];
  ignorarId?: string | null;
}): ViolacionPlano[] {
  const { rect, columnas, filas, elementos, ignorarId } = params;
  const violaciones: ViolacionPlano[] = [];
  if (!cabeEnPiso(rect, columnas, filas)) {
    violaciones.push({
      codigo: "fuera_de_piso",
      mensaje: "El elemento queda fuera del piso o su tamaño no es válido.",
    });
  }
  for (const elemento of elementos) {
    if (ignorarId && elemento.id === ignorarId) continue;
    if (rectsOverlap(rect, elemento)) {
      violaciones.push({
        codigo: "encimado",
        mensaje: "El elemento se encima con otro ya colocado en el piso.",
        conflictoId: elemento.id,
      });
      break;
    }
  }
  return violaciones;
}

/**
 * Elementos que quedarían fuera del piso con un tamaño nuevo (para reducir la
 * cuadrícula). Devuelve la lista vacía cuando la reducción es segura.
 */
export function elementosFueraDelPiso(
  columnas: number,
  filas: number,
  elementos: readonly ElementoPlano[],
): ElementoPlano[] {
  return elementos.filter((elemento) => !cabeEnPiso(elemento, columnas, filas));
}

/**
 * Primera celda libre para un elemento nuevo de `ancho` × `alto` (default
 * 2×1), recorriendo el piso en orden de lectura (de arriba a abajo, de
 * izquierda a derecha). `null` cuando el piso está lleno.
 */
export function primerEspacioLibre(params: {
  columnas: number;
  filas: number;
  elementos: readonly PlanoRect[];
  ancho?: number;
  alto?: number;
}): { x: number; y: number } | null {
  const { columnas, filas, elementos } = params;
  const ancho = params.ancho ?? 2;
  const alto = params.alto ?? 1;
  for (let y = 0; y + alto <= filas; y += 1) {
    for (let x = 0; x + ancho <= columnas; x += 1) {
      const candidato: PlanoRect = { x, y, ancho, alto };
      if (!elementos.some((elemento) => rectsOverlap(candidato, elemento))) {
        return { x, y };
      }
    }
  }
  return null;
}
