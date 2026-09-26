/**
 * Utilidades puras de la rejilla de agenda (posicionamiento, fechas). Sin
 * efectos ni React para poder testearlas y reutilizarlas en todas las vistas.
 */

import { getZonedParts } from "@/modules/agenda";

import type { AgendaCita } from "./agenda-types";

export function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function dateTimeInputValue(iso: string, timeZone: string) {
  const parts = getZonedParts(new Date(iso), timeZone);
  return `${parts.dayKey}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function citaInterval(cita: AgendaCita) {
  const iniciaAtMs = new Date(cita.fechaHora).getTime();
  return { iniciaAtMs, terminaAtMs: iniciaAtMs + cita.duracionMinutos * 60_000 };
}

export function iniciales(nombre: string) {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "·"
  );
}

/** Citas que se traslapan en una columna reciben carriles horizontales. */
export function layoutCitas(citas: AgendaCita[], timeZone: string) {
  const items = citas
    .map((cita) => {
      const inicioMin = getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia;
      return { cita, inicioMin, finMin: inicioMin + cita.duracionMinutos };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  const layout = new Map<string, { lane: number; lanes: number }>();
  let cluster: typeof items = [];
  let clusterFin = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const ocupados: number[] = [];
    for (const item of cluster) {
      let lane = 0;
      for (;;) {
        const libre = !cluster.some(
          (otro) =>
            otro !== item &&
            layout.get(otro.cita.id)?.lane === lane &&
            otro.inicioMin < item.finMin &&
            otro.finMin > item.inicioMin,
        );
        if (libre) break;
        lane += 1;
      }
      ocupados.push(lane);
      layout.set(item.cita.id, { lane, lanes: 0 });
    }
    const lanes = Math.max(...ocupados, 0) + 1;
    for (const item of cluster) {
      const pos = layout.get(item.cita.id);
      if (pos) layout.set(item.cita.id, { ...pos, lanes });
    }
    cluster = [];
    clusterFin = -Infinity;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.inicioMin >= clusterFin) flush();
    cluster.push(item);
    clusterFin = Math.max(clusterFin, item.finMin);
  }
  flush();
  return layout;
}
