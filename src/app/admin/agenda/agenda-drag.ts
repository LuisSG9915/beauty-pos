"use client";

/**
 * Arrastre unificado de citas con Pointer Events (mouse, pen y táctil), sin
 * librerías: HTML5 DnD no dispara en iOS/Android, así que aquí se controla el
 * gesto completo — pulsación larga en táctil, umbral de 6 px en mouse,
 * autoscroll del contenedor y vista previa ("fantasma") del horario destino.
 *
 * El estado del arrastre lo consume `day-grid.tsx` para pintar el fantasma y
 * atenuar la tarjeta original; el soltado lo decide `agenda-board.tsx`.
 *
 * Todos los datos mutables viven en refs: los handlers registrados en window
 * conservan identidad estable entre renders a mitad de gesto (de otro modo
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

import { getZonedParts } from "@/modules/agenda";

import type { AgendaCita } from "./agenda-types";
import { PX_PER_MIN } from "./agenda-types";
import { minutoDesdeY } from "./agenda-utils";

export type ModoArrastre = "mover" | "duracion";

export type EstadoArrastre = {
  citaId: string;
  modo: ModoArrastre;
  /** Profesional destino ("" = sin asignar); null = puntero fuera de columnas. */
  columnaId: string | null;
  /** Minutos del día de la hora de inicio (snap 15). */
  minutoInicio: number;
  /** Duración en minutos (snap 15, mínimo 15). */
  duracion: number;
};

export type SoltarMover = {
  cita: AgendaCita;
  columnaId: string;
  minutoInicio: number;
  duracion: number;
};

export type SoltarDuracion = { cita: AgendaCita; duracion: number };

const UMBRAL_MOUSE_PX = 6;
const UMBRAL_TOUCH_PX = 10;
const PULSACION_MS = 350;
const BORDE_SCROLL_PX = 48;
const VELOCIDAD_SCROLL_PX = 14;

type Gesto = {
  pointerId: number;
  cita: AgendaCita;
  modo: ModoArrastre;
  /** Elemento raíz de la tarjeta (recibe el pointer capture y touch-action). */
  elemento: HTMLElement;
  /** Columna de origen: referencia de geometría para el modo "duracion". */
  columnaEl: HTMLElement | null;
  inicioX: number;
  inicioY: number;
  ultimoX: number;
  ultimoY: number;
  /** Minutos desde el borde superior de la tarjeta al punto agarrado. */
  agarreMin: number;
  esTouch: boolean;
  activo: boolean;
  timer: number | null;
};

function columnaDesdePunto(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-columna-id]") ?? null;
}

function prevenirContextMenu(event: Event) {
  event.preventDefault();
}

/**
 * Engancha los gestos de arrastre sobre las tarjetas del día. Devuelve el
 * estado visible (`arrastre`), el iniciador para pointerdown y `consumirClick`
 * para tragar el clic residual que sigue a un soltado.
 */
export function useArrastreCita({
  gridRef,
  startMin,
  endMin,
  timeZone,
  columnaUnica,
  disabled = false,
  onSoltarMover,
  onSoltarDuracion,
}: {
  /** Contenedor con scroll (`data-agenda-grid`) para autoscroll por bordes. */
  gridRef: RefObject<HTMLElement | null>;
  startMin: number;
  endMin: number;
  timeZone: string;
  /**
   * Si está definida (móvil, una sola columna visible), "mover" queda fijado a
   * este profesional: el arrastre solo cambia la hora.
   */
  columnaUnica?: string;
  disabled?: boolean;
  onSoltarMover: (resultado: SoltarMover) => void;
  onSoltarDuracion: (resultado: SoltarDuracion) => void;
}) {
  const [arrastre, setArrastre] = useState<EstadoArrastre | null>(null);
  const gestoRef = useRef<Gesto | null>(null);
  /** Hasta cuándo hay que tragar el clic residual del gesto (0 = nunca). */
  const tragarClickHastaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onSoltarMover, onSoltarDuracion });
  const paramsRef = useRef({ startMin, endMin, timeZone, columnaUnica });
  const limpiarRef = useRef<() => void>(() => {});

  // "Latest ref" sincronizado en efecto (las reglas de hooks prohíben
  // escribir refs durante el render): los listeners de window siempre
  // corren después del efecto, así que ven el valor más reciente.
  useEffect(() => {
    callbacksRef.current = { onSoltarMover, onSoltarDuracion };
    paramsRef.current = { startMin, endMin, timeZone, columnaUnica };
  });

  /** Estado del arrastre para el punto (x, y); null si no hay gesto válido. */
  const calcularArrastre = useCallback((g: Gesto, x: number, y: number): EstadoArrastre | null => {
    const { startMin: sMin, endMin: eMin, timeZone: zona, columnaUnica: unica } = paramsRef.current;
    if (g.modo === "duracion") {
      const columnaEl = g.columnaEl;
      if (!columnaEl) return null;
      const inicioMin = getZonedParts(new Date(g.cita.fechaHora), zona).minutosDelDia;
      const rect = columnaEl.getBoundingClientRect();
      const minutoPuntero = sMin + (y - rect.top) / PX_PER_MIN;
      const duracion = Math.min(
        Math.max(Math.round((minutoPuntero - inicioMin) / 15) * 15, 15),
        eMin - inicioMin,
      );
      return {
        citaId: g.cita.id,
        modo: "duracion",
        columnaId: g.cita.usuarioId ?? "",
        minutoInicio: inicioMin,
        duracion,
      };
    }
    const columnaEl = columnaDesdePunto(x, y);
    if (!columnaEl) {
      return {
        citaId: g.cita.id,
        modo: "mover",
        columnaId: null,
        minutoInicio: 0,
        duracion: g.cita.duracionMinutos,
      };
    }
    const columnaId = unica !== undefined ? unica : (columnaEl.dataset.columnaId ?? "");
    const rect = columnaEl.getBoundingClientRect();
    // El punto agarrado se conserva: la tarjeta no salta respecto al puntero.
    const minutoInicio = minutoDesdeY(
      y - g.agarreMin * PX_PER_MIN,
      rect.top,
      sMin,
      eMin,
      g.cita.duracionMinutos,
    );
    return {
      citaId: g.cita.id,
      modo: "mover",
      columnaId,
      minutoInicio,
      duracion: g.cita.duracionMinutos,
    };
  }, []);

  const actualizar = useCallback(
    (g: Gesto, x: number, y: number) => {
      const estado = calcularArrastre(g, x, y);
      setArrastre((prev) =>
        prev !== null &&
        estado !== null &&
        prev.citaId === estado.citaId &&
        prev.modo === estado.modo &&
        prev.columnaId === estado.columnaId &&
        prev.minutoInicio === estado.minutoInicio &&
        prev.duracion === estado.duracion
          ? prev
          : estado,
      );
    },
    [calcularArrastre],
  );

  // Bucle de frames mientras el gesto está activo: autoscroll cerca de los
  // bordes y reevaluación de la posición (al hacer scroll el contenido se
  // mueve bajo el puntero aunque éste no se mueva).
  const iniciaRaf = useCallback(() => {
    const paso = () => {
      const g = gestoRef.current;
      if (!g?.activo) {
        rafRef.current = null;
        return;
      }
      const grid = gridRef.current;
      if (grid) {
        const rect = grid.getBoundingClientRect();
        if (g.ultimoY < rect.top + BORDE_SCROLL_PX) {
          grid.scrollTop -= Math.ceil(
            ((rect.top + BORDE_SCROLL_PX - g.ultimoY) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        } else if (g.ultimoY > rect.bottom - BORDE_SCROLL_PX) {
          grid.scrollTop += Math.ceil(
            ((g.ultimoY - (rect.bottom - BORDE_SCROLL_PX)) / BORDE_SCROLL_PX) * VELOCIDAD_SCROLL_PX,
          );
        }
      }
      actualizar(g, g.ultimoX, g.ultimoY);
      rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
  }, [actualizar, gridRef]);

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
    actualizar(g, g.ultimoX, g.ultimoY);
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
      actualizar(g, event.clientX, event.clientY);
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
      const estado = calcularArrastre(g, event.clientX, event.clientY);
      marcarTragarClick();
      limpiarRef.current();
      if (!estado) return;
      if (estado.modo === "mover") {
        if (estado.columnaId === null) return; // fuera de la rejilla: regresa.
        callbacksRef.current.onSoltarMover({
          cita: g.cita,
          columnaId: estado.columnaId,
          minutoInicio: estado.minutoInicio,
          duracion: estado.duracion,
        });
      } else {
        callbacksRef.current.onSoltarDuracion({ cita: g.cita, duracion: estado.duracion });
      }
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
   * pointerdown sobre la tarjeta ("mover") o sobre el asa inferior
   * ("duracion"). En táctil el arrastre arranca tras una pulsación larga de
   * 350 ms para no pelear con el scroll; en mouse/pen basta mover > 6 px.
   */
  const iniciarGesto = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cita: AgendaCita, modo: ModoArrastre) => {
      if (disabled || gestoRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const objetivo = event.target as HTMLElement;
      if (modo === "mover") {
        // Controles internos (Cobrar, enlaces) y el asa de resize no arrastran.
        if (objetivo.closest("button, a, input, select, textarea, [data-resize-handle]")) return;
      } else if (!objetivo.closest("[data-resize-handle]")) {
        // "duracion" solo arranca desde el asa inferior de la tarjeta.
        return;
      }
      const elemento = (
        modo === "mover" ? event.currentTarget : objetivo.closest("[data-cita-card]")
      ) as HTMLElement | null;
      if (!elemento) return;
      const rect = elemento.getBoundingClientRect();
      const gesto: Gesto = {
        pointerId: event.pointerId,
        cita,
        modo,
        elemento,
        columnaEl: elemento.closest<HTMLElement>("[data-columna-id]"),
        inicioX: event.clientX,
        inicioY: event.clientY,
        ultimoX: event.clientX,
        ultimoY: event.clientY,
        agarreMin: modo === "mover" ? (event.clientY - rect.top) / PX_PER_MIN : 0,
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
