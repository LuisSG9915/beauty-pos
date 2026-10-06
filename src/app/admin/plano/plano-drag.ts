"use client";

/**
 * Arrastre del plano del salón con Pointer Events (mouse, pen y táctil), sin
 * librerías ni HTML5 DnD (que no dispara en iOS/Android): mismo motor que
 * `agenda-drag.ts` — umbral de 6 px en mouse, pulsación larga de 350 ms en
 * táctil, autoscroll del contenedor y Escape para cancelar.
 *
 * La geometría es de celdas enteras (1 celda = 32 px en el viewBox): el
 * puntero se convierte a celdas con snap y el estado del arrastre se valida
 * en vivo contra los demás elementos del piso (fuera de piso / encimado).
 * `plano-board.tsx` decide qué pasa al soltar (`moverElemento`).
 *
 * Todos los datos mutables viven en refs: los listeners registrados en
 * window conservan identidad estable a mitad de gesto (de otro modo
 * removeEventListener no encontraría al listener y quedarían fugados).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { validarColocacion, type ElementoPlano, type PlanoRect } from "@/modules/plano";

export type TipoElementoPlano = "ubicacion" | "mobiliario";
export type ModoArrastrePlano = "mover" | "redimensionar";

/** Estado del arrastre en curso; el lienzo lo dibuja como fantasma. */
export type ArrastrePlano = {
  id: string;
  tipo: TipoElementoPlano;
  modo: ModoArrastrePlano;
  /** Rectángulo en celdas ya con snap a la cuadrícula. */
  rect: PlanoRect;
  /** false si el resultado cae fuera del piso o encima de otro elemento. */
  valido: boolean;
};

/** Lo que recibe `onSoltar` al terminar el gesto. */
export type SoltarPlano = {
  id: string;
  tipo: TipoElementoPlano;
  rect: PlanoRect;
  /** Rectángulo de origen (para el "Deshacer" del toast tras mover). */
  origen: PlanoRect;
  /** true solo si el rectángulo cambió respecto al de origen y es válido. */
  cambio: boolean;
};

const UMBRAL_MOUSE_PX = 6;
const UMBRAL_TOUCH_PX = 10;
const PULSACION_MS = 350;
const BORDE_SCROLL_PX = 36;
const VELOCIDAD_SCROLL_PX = 14;
const CELDA_PX = 32;

type Gesto = {
  pointerId: number;
  tipo: TipoElementoPlano;
  id: string;
  modo: ModoArrastrePlano;
  /** Elemento SVG raíz de la figura (recibe pointer capture y touch-action). */
  elemento: SVGGElement;
  origen: PlanoRect;
  inicioX: number;
  inicioY: number;
  ultimoX: number;
  ultimoY: number;
  esTouch: boolean;
  activo: boolean;
  timer: number | null;
};

function prevenirContextMenu(event: Event) {
  event.preventDefault();
}

/**
 * Engancha los gestos sobre las figuras del <svg>. Devuelve el estado visible
 * (`arrastre`), `iniciarGesto` para el pointerdown de cada figura/manija y
 * `consumirClick` para tragar el clic residual que sigue a un soltado.
 */
export function useArrastrePlano({
  svgRef,
  scrollRef,
  columnas,
  filas,
  elementos,
  disabled = false,
  onSoltar,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  /** Contenedor con scroll horizontal/vertical para autoscroll por bordes. */
  scrollRef?: RefObject<HTMLElement | null>;
  columnas: number;
  filas: number;
  /** Demás elementos activos del piso (para detectar encimados en vivo). */
  elementos: ElementoPlano[];
  disabled?: boolean;
  onSoltar?: (resultado: SoltarPlano) => void;
}) {
  const [arrastre, setArrastre] = useState<ArrastrePlano | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  /** Hasta cuándo hay que tragar el clic residual del gesto (0 = nunca). */
  const tragarClickHastaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const paramsRef = useRef({ columnas, filas, elementos });
  const callbacksRef = useRef({ onSoltar });
  const limpiarRef = useRef<() => void>(() => {});

  // "Latest ref" sincronizado en efecto (las reglas de hooks prohíben
  // escribir refs durante el render): los listeners de window siempre
  // corren después del efecto, así que ven el valor más reciente.
  useEffect(() => {
    paramsRef.current = { columnas, filas, elementos };
    callbacksRef.current = { onSoltar };
  });

  /** Celda en píxeles de pantalla según el tamaño dibujado del svg. */
  const tamanoCelda = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || paramsRef.current.columnas <= 0) return CELDA_PX;
    return svg.getBoundingClientRect().width / paramsRef.current.columnas;
  }, [svgRef]);

  /** Rectángulo del gesto con snap a celdas y clamp al piso. */
  const rectDeGesto = useCallback(
    (g: Gesto): PlanoRect => {
      const { columnas: cols, filas: rows } = paramsRef.current;
      const celda = tamanoCelda();
      const dx = Math.round((g.ultimoX - g.inicioX) / celda);
      const dy = Math.round((g.ultimoY - g.inicioY) / celda);
      if (g.modo === "redimensionar") {
        return {
          x: g.origen.x,
          y: g.origen.y,
          ancho: Math.min(Math.max(g.origen.ancho + dx, 1), cols - g.origen.x),
          alto: Math.min(Math.max(g.origen.alto + dy, 1), rows - g.origen.y),
        };
      }
      return {
        x: Math.min(Math.max(g.origen.x + dx, 0), cols - g.origen.ancho),
        y: Math.min(Math.max(g.origen.y + dy, 0), rows - g.origen.alto),
        ancho: g.origen.ancho,
        alto: g.origen.alto,
      };
    },
    [tamanoCelda],
  );

  /** Estado visible del gesto: rectángulo + validez contra los otros elementos. */
  const calcularArrastre = useCallback(
    (g: Gesto): ArrastrePlano => {
      const rect = rectDeGesto(g);
      const { columnas: cols, filas: rows, elementos: otros } = paramsRef.current;
      const valido =
        validarColocacion({ rect, columnas: cols, filas: rows, elementos: otros, ignorarId: g.id })
          .length === 0;
      return { id: g.id, tipo: g.tipo, modo: g.modo, rect, valido };
    },
    [rectDeGesto],
  );

  const actualizar = useCallback(
    (g: Gesto) => {
      const estado = calcularArrastre(g);
      setArrastre((prev) =>
        prev !== null &&
        prev.id === estado.id &&
        prev.modo === estado.modo &&
        prev.rect.x === estado.rect.x &&
        prev.rect.y === estado.rect.y &&
        prev.rect.ancho === estado.rect.ancho &&
        prev.rect.alto === estado.rect.alto &&
        prev.valido === estado.valido
          ? prev
          : estado,
      );
    },
    [calcularArrastre],
  );

  // Bucle de frames mientras el gesto está activo: autoscroll en ambos ejes
  // cerca de los bordes y reevaluación de la posición (al hacer scroll el
  // contenido se mueve bajo el puntero aunque éste no se mueva).
  const iniciaRaf = useCallback(() => {
    const paso = () => {
      const g = gestoRef.current;
      if (!g?.activo) {
        rafRef.current = null;
        return;
      }
      const contenedor = scrollRef?.current;
      if (contenedor) {
        const rect = contenedor.getBoundingClientRect();
        if (g.ultimoX < rect.left + BORDE_SCROLL_PX) {
          contenedor.scrollLeft -= Math.ceil(
            ((rect.left + BORDE_SCROLL_PX - g.ultimoX) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        } else if (g.ultimoX > rect.right - BORDE_SCROLL_PX) {
          contenedor.scrollLeft += Math.ceil(
            ((g.ultimoX - (rect.right - BORDE_SCROLL_PX)) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        }
        if (g.ultimoY < rect.top + BORDE_SCROLL_PX) {
          contenedor.scrollTop -= Math.ceil(
            ((rect.top + BORDE_SCROLL_PX - g.ultimoY) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        } else if (g.ultimoY > rect.bottom - BORDE_SCROLL_PX) {
          contenedor.scrollTop += Math.ceil(
            ((g.ultimoY - (rect.bottom - BORDE_SCROLL_PX)) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        }
      }
      actualizar(g);
      rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
  }, [actualizar, scrollRef]);

  const marcarTragarClick = useCallback(() => {
    tragarClickHastaRef.current = performance.now() + 500;
  }, []);

  const alTecla = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (gestoRef.current?.activo) marcarTragarClick();
      limpiarRef.current();
    },
    [marcarTragarClick],
  );

  const activar = useCallback(() => {
    const g = gestoRef.current;
    if (!g || g.activo) return;
    g.activo = true;
    try {
      g.elemento.setPointerCapture(g.pointerId);
    } catch {
      // Puntero ya liberado; el arrastre sigue funcionando sin capture.
    }
    g.elemento.style.touchAction = "none";
    if (g.esTouch) {
      try {
        navigator.vibrate?.(10);
      } catch {
        // Háptica opcional: ignora plataformas sin soporte.
      }
    }
    document.body.style.userSelect = "none";
    window.addEventListener("keydown", alTecla, true);
    window.addEventListener("contextmenu", prevenirContextMenu, true);
    iniciaRaf();
    actualizar(g);
  }, [actualizar, alTecla, iniciaRaf]);

  const alMover = useCallback(
    (event: PointerEvent) => {
      const g = gestoRef.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.ultimoX = event.clientX;
      g.ultimoY = event.clientY;
      if (!g.activo) {
        const dx = event.clientX - g.inicioX;
        const dy = event.clientY - g.inicioY;
        const dist2 = dx * dx + dy * dy;
        if (g.esTouch) {
          // Antes de la pulsación larga un movimiento es scroll: cede el gesto.
          if (dist2 > UMBRAL_TOUCH_PX * UMBRAL_TOUCH_PX) limpiarRef.current();
        } else if (dist2 > UMBRAL_MOUSE_PX * UMBRAL_MOUSE_PX) {
          activar();
        }
        return;
      }
      event.preventDefault();
      actualizar(g);
    },
    [activar, actualizar],
  );

  const alSoltar = useCallback(
    (event: PointerEvent) => {
      const g = gestoRef.current;
      if (!g || event.pointerId !== g.pointerId) return;
      if (!g.activo) {
        limpiarRef.current();
        return;
      }
      const estado = calcularArrastre(g);
      marcarTragarClick();
      limpiarRef.current();
      const cambio =
        estado.valido &&
        (estado.rect.x !== g.origen.x ||
          estado.rect.y !== g.origen.y ||
          estado.rect.ancho !== g.origen.ancho ||
          estado.rect.alto !== g.origen.alto);
      // Posición inválida o sin cambio: la figura regresa a su lugar sola.
      if (!cambio) return;
      callbacksRef.current.onSoltar?.({
        id: estado.id,
        tipo: estado.tipo,
        rect: estado.rect,
        origen: g.origen,
        cambio: true,
      });
    },
    [calcularArrastre, marcarTragarClick],
  );

  const alCancelar = useCallback(
    (event: PointerEvent) => {
      const g = gestoRef.current;
      if (!g || event.pointerId !== g.pointerId) return;
      if (g.activo) marcarTragarClick();
      limpiarRef.current();
    },
    [marcarTragarClick],
  );

  const limpiar = useCallback(() => {
    const g = gestoRef.current;
    gestoRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (g?.timer != null) window.clearTimeout(g.timer);
    if (g?.activo) {
      g.elemento.style.touchAction = "";
      document.body.style.userSelect = "";
      window.removeEventListener("keydown", alTecla, true);
      window.removeEventListener("contextmenu", prevenirContextMenu, true);
    }
    window.removeEventListener("pointermove", alMover);
    window.removeEventListener("pointerup", alSoltar);
    window.removeEventListener("pointercancel", alCancelar);
    setArrastre(null);
  }, [alCancelar, alMover, alSoltar, alTecla]);

  // `limpiar` se usa desde handlers creados antes en el archivo: el ref
  // rompe el ciclo manteniendo identidades estables durante el gesto.
  useEffect(() => {
    limpiarRef.current = limpiar;
  }, [limpiar]);

  /**
   * pointerdown sobre la figura ("mover") o sobre su manija inferior derecha
   * ("redimensionar"). En táctil el arrastre arranca tras pulsación larga de
   * 350 ms para no pelear con el scroll; en mouse/pen basta mover > 6 px.
   */
  const iniciarGesto = useCallback(
    (
      event: ReactPointerEvent<SVGGElement | SVGRectElement>,
      elemento: ElementoPlano & { tipo: TipoElementoPlano },
      modo: ModoArrastrePlano,
    ) => {
      if (disabled || gestoRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // Sin preventDefault: el clic residual lo traga `consumirClick`; la
      // propagación sí se corta para que la manija de resize no dispare el
      // gesto "mover" del <g> padre.
      event.stopPropagation();
      const figura = event.currentTarget.closest("g");
      if (!figura) return;
      const gesto: Gesto = {
        pointerId: event.pointerId,
        tipo: elemento.tipo,
        id: elemento.id,
        modo,
        elemento: figura,
        origen: { x: elemento.x, y: elemento.y, ancho: elemento.ancho, alto: elemento.alto },
        inicioX: event.clientX,
        inicioY: event.clientY,
        ultimoX: event.clientX,
        ultimoY: event.clientY,
        esTouch: event.pointerType === "touch",
        activo: false,
        timer: null,
      };
      gestoRef.current = gesto;
      if (gesto.esTouch) {
        gesto.timer = window.setTimeout(activar, PULSACION_MS);
      }
      window.addEventListener("pointermove", alMover, { passive: false });
      window.addEventListener("pointerup", alSoltar);
      window.addEventListener("pointercancel", alCancelar);
    },
    [activar, alCancelar, alMover, alSoltar, disabled],
  );

  // Limpieza al desmontar (navegación a mitad de un gesto).
  useEffect(() => limpiar, [limpiar]);

  /** Devuelve true una sola vez si el clic cae en la ventana residual del gesto. */
  const consumirClick = useCallback(() => {
    const hasta = tragarClickHastaRef.current;
    tragarClickHastaRef.current = 0;
    return hasta > 0 && performance.now() < hasta;
  }, []);

  return { arrastre, consumirClick, iniciarGesto };
}
