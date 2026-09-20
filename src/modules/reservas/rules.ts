/**
 * Reglas puras del portal público de reservas. Reciben la ocupación ya
 * cargada y la zona horaria para poder probarlas sin base de datos.
 */

import {
  validateCitaAvailability,
  type BloqueoLike,
  type CitaLike,
  type RecursoLike,
  type TurnoDia,
} from "@/modules/agenda/rules";
import { getZonedParts, localDateTimeToUtc } from "@/modules/agenda/timezone";
import { intervalFromDates } from "@/modules/agenda/types";

export type OcupacionDia = {
  horarios: readonly TurnoDia[];
  bloqueos: readonly BloqueoLike[];
  citas: readonly CitaLike[];
  recursos?: readonly RecursoLike[];
};

/**
 * Horarios de inicio libres (UTC) para `diaKey` en la zona horaria dada,
 * en pasos de `pasoMinutos` dentro de cada turno activo. Las reservas web
 * usan el carril "sin asignar" (usuarioId null → capacidadSinAsignar).
 * No devuelve horarios ya pasados respecto a `ahora`.
 */
export function slotsDisponiblesDia(params: {
  diaKey: string;
  duracionMinutos: number;
  ocupacion: OcupacionDia;
  zonaHoraria: string;
  capacidadSinAsignar?: number;
  /** Instante actual; slots que inicien antes se omiten. */
  ahora?: Date;
  pasoMinutos?: number;
}): Date[] {
  const {
    diaKey,
    duracionMinutos,
    ocupacion,
    zonaHoraria,
    capacidadSinAsignar,
    pasoMinutos = 30,
  } = params;
  const ahoraMs = params.ahora?.getTime() ?? 0;
  if (!Number.isInteger(duracionMinutos) || duracionMinutos <= 0 || pasoMinutos <= 0) return [];

  const mediodia = localDateTimeToUtc(`${diaKey}T12:00`, zonaHoraria);
  if (!mediodia) return [];
  const diaSemana = getZonedParts(mediodia, zonaHoraria).diaSemana;
  const turnos = ocupacion.horarios.filter((h) => h.activo && h.diaSemana === diaSemana);

  const slots: Date[] = [];
  for (const turno of turnos) {
    const ultimoInicio = turno.terminaMinutos - duracionMinutos;
    for (let minutos = turno.iniciaMinutos; minutos <= ultimoInicio; minutos += pasoMinutos) {
      const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
      const mm = String(minutos % 60).padStart(2, "0");
      const inicio = localDateTimeToUtc(`${diaKey}T${hh}:${mm}`, zonaHoraria);
      if (!inicio || inicio.getTime() <= ahoraMs) continue;

      const candidato = { ...intervalFromDates(inicio, duracionMinutos), usuarioId: null };
      const disponible = validateCitaAvailability({
        candidato,
        diaSemana,
        iniciaMinutosLocal: minutos,
        duracionMinutos,
        horarios: ocupacion.horarios,
        bloqueos: ocupacion.bloqueos,
        citas: ocupacion.citas,
        recursos: ocupacion.recursos,
        capacidadSinAsignar,
      });
      if (disponible.ok) slots.push(inicio);
    }
  }
  return slots;
}

export type ReservaClienteInput = {
  nombre: string;
  telefono: string;
  correo?: string;
  notas?: string;
};

/** Normalización compatible con el alta interna de clientes (deduplicación). */
export function normalizarContacto(value: string | undefined): string | null {
  return value?.trim().toLowerCase().replace(/\s+/g, "") || null;
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validación de los datos que el cliente captura en el portal público. */
export function validarDatosReserva(input: ReservaClienteInput): { ok: true } | { ok: false; error: string } {
  const nombre = input.nombre.trim();
  if (nombre.length < 2 || nombre.length > 160) {
    return { ok: false, error: "Escribe tu nombre completo." };
  }
  const telefono = input.telefono.trim();
  if (telefono.length < 7 || telefono.length > 30) {
    return { ok: false, error: "Escribe un teléfono válido para confirmar tu cita." };
  }
  const correo = input.correo?.trim() ?? "";
  if (correo && (correo.length > 254 || !CORREO_RE.test(correo))) {
    return { ok: false, error: "Escribe un correo válido o déjalo vacío." };
  }
  if ((input.notas?.length ?? 0) > 2000) {
    return { ok: false, error: "Las notas no pueden superar 2,000 caracteres." };
  }
  return { ok: true };
}
