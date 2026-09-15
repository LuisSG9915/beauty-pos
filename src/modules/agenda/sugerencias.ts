/**
 * Sugerencias de próximos espacios disponibles cuando una cita choca con
 * horario, bloqueo o traslape. Función pura: recibe la ocupación ya cargada
 * por el caller (horarios, bloqueos y citas vivas) y explora los turnos del
 * día solicitado y de los siguientes, en pasos de `pasoMinutos`.
 */

import {
  validateCitaAvailability,
  type BloqueoLike,
  type CitaLike,
  type RecursoLike,
  type TurnoDia,
} from "./rules";
import {
  getZonedParts,
  localDateTimeToUtc,
  shiftDateKey,
} from "./timezone";
import { intervalFromDates } from "./types";

export interface SugerenciaParams {
  /** Instante candidato original (la búsqueda empieza aquí, redondeado a paso). */
  desde: Date;
  duracionMinutos: number;
  /** null = carril "sin asignar" (usa capacidadSinAsignar). */
  usuarioId: string | null;
  /** Recursos que la cita ocupará; también deben estar libres. */
  recursoIds?: readonly string[];
  ocupacion: {
    horarios: readonly TurnoDia[];
    bloqueos: readonly BloqueoLike[];
    citas: readonly CitaLike[];
    recursos?: readonly RecursoLike[];
  };
  zonaHoraria: string;
  capacidadSinAsignar?: number;
  ignoreCitaId?: string | null;
  /** Máximo de sugerencias devueltas (default 3). */
  limite?: number;
  /** Granularidad de la búsqueda en minutos (default 15). */
  pasoMinutos?: number;
  /** Días calendario a explorar desde `desde` (default 4). */
  diasBusqueda?: number;
}

/**
 * Devuelve hasta `limite` instantes UTC de inicio libres, ordenados. Busca en
 * cada turno activo del día; en el día de `desde` no retrocede antes de esa
 * hora. Devuelve [] si no hay turnos o nada libre en el rango explorado.
 */
export function sugerirHorariosLibres(params: SugerenciaParams): Date[] {
  const {
    desde,
    duracionMinutos,
    usuarioId,
    recursoIds,
    ocupacion,
    zonaHoraria,
    capacidadSinAsignar,
    ignoreCitaId,
  } = params;
  const limite = params.limite ?? 3;
  const paso = params.pasoMinutos ?? 15;
  const diasBusqueda = params.diasBusqueda ?? 4;
  if (!Number.isInteger(duracionMinutos) || duracionMinutos <= 0 || limite <= 0) return [];

  const partesDesde = getZonedParts(desde, zonaHoraria);
  const sugerencias: Date[] = [];

  for (let offset = 0; offset < diasBusqueda && sugerencias.length < limite; offset++) {
    const dk = shiftDateKey(partesDesde.dayKey, offset);
    if (!dk) continue;
    // Mediodía local evita bordes de DST al leer el día de semana.
    const noon = localDateTimeToUtc(`${dk}T12:00`, zonaHoraria);
    if (!noon) continue;
    const diaSemana = getZonedParts(noon, zonaHoraria).diaSemana;
    const turnos = ocupacion.horarios.filter((h) => h.activo && h.diaSemana === diaSemana);

    for (const turno of turnos) {
      const ultimoInicio = turno.terminaMinutos - duracionMinutos;
      // En el día inicial no se sugieren horas anteriores a `desde`.
      const inicioMin =
        offset === 0
          ? Math.max(turno.iniciaMinutos, Math.ceil(partesDesde.minutosDelDia / paso) * paso)
          : turno.iniciaMinutos;

      for (let minutos = inicioMin; minutos <= ultimoInicio && sugerencias.length < limite; minutos += paso) {
        const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
        const mm = String(minutos % 60).padStart(2, "0");
        const inicio = localDateTimeToUtc(`${dk}T${hh}:${mm}`, zonaHoraria);
        if (!inicio) continue;
        if (offset === 0 && inicio.getTime() < desde.getTime()) continue;

        const candidato = { ...intervalFromDates(inicio, duracionMinutos), usuarioId };
        const disponible = validateCitaAvailability({
          candidato,
          diaSemana,
          iniciaMinutosLocal: minutos,
          duracionMinutos,
          horarios: ocupacion.horarios,
          bloqueos: ocupacion.bloqueos,
          citas: ocupacion.citas,
          recursoIds,
          recursos: ocupacion.recursos,
          ignoreCitaId,
          capacidadSinAsignar,
        });
        if (disponible.ok) sugerencias.push(inicio);
      }
    }
  }
  return sugerencias;
}
