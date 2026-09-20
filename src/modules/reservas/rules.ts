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
  /** Profesional asignado; null/omitido = carril "sin asignar". */
  usuarioId?: string | null;
  /** Cita a ignorar al medir traslapes (p.ej. la que se reagenda). */
  ignoreCitaId?: string;
}): Date[] {
  const {
    diaKey,
    duracionMinutos,
    ocupacion,
    zonaHoraria,
    capacidadSinAsignar,
    pasoMinutos = 30,
    usuarioId = null,
    ignoreCitaId,
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

      const candidato = { ...intervalFromDates(inicio, duracionMinutos), usuarioId };
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
        ignoreCitaId,
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

/* ------------------------------------------------------------------ */
/* Autogestión pública: ventana de reserva, edición y antiabuso          */
/* ------------------------------------------------------------------ */

export type PoliticaReservas = {
  /** Horas mínimas antes de la cita para cancelar/reagendar en línea. */
  cancelacionHoras: number;
  /** Minutos mínimos de anticipación para reservar. */
  anticipacionMinutos: number;
  /** Días máximos hacia adelante en que se puede reservar. */
  horizonteDias: number;
};

export type CitaGestionable = {
  fechaHora: Date;
  estado: string;
  activo: boolean;
};

/** Estados de cita que el cliente puede cancelar o reagendar en línea. */
const ESTADOS_GESTIONABLES = new Set(["pendiente", "confirmada"]);

/**
 * Ventana de creación: la fecha elegida debe estar al menos
 * `anticipacionMinutos` en el futuro y no más allá de `horizonteDias`.
 */
export function dentroDeVentanaReserva(
  fechaHora: Date,
  politica: PoliticaReservas,
  ahora: Date,
): { ok: true } | { ok: false; error: string } {
  const minMs = ahora.getTime() + politica.anticipacionMinutos * 60_000;
  const maxMs = ahora.getTime() + politica.horizonteDias * 24 * 60 * 60_000;
  const t = fechaHora.getTime();
  if (t <= minMs) {
    return { ok: false, error: "Elige un horario con más anticipación." };
  }
  if (t > maxMs) {
    return { ok: false, error: `Las reservas en línea se abren hasta ${politica.horizonteDias} días.` };
  }
  return { ok: true };
}

/**
 * Decide si la cita puede editarse desde el enlace público: activa, en estado
 * gestionable y fuera del plazo de corte (`fechaHora - ahora >= cancelacionHoras`).
 */
export function puedeGestionarCita(
  cita: CitaGestionable,
  politica: Pick<PoliticaReservas, "cancelacionHoras">,
  ahora: Date,
): { puede: true } | { puede: false; motivo: string } {
  if (!cita.activo) return { puede: false, motivo: "Esta cita ya no está disponible." };
  if (!ESTADOS_GESTIONABLES.has(cita.estado)) {
    return { puede: false, motivo: `La cita ya está ${cita.estado} y no puede modificarse en línea.` };
  }
  const limiteMs = cita.fechaHora.getTime() - politica.cancelacionHoras * 60 * 60_000;
  if (ahora.getTime() > limiteMs) {
    return {
      puede: false,
      motivo: `Los cambios en línea cierran ${politica.cancelacionHoras} h antes de la cita. Comunícate con el negocio.`,
    };
  }
  return { puede: true };
}

/** Evalúa un límite de ventana deslizante sobre timestamps ya cargados. */
export function rateLimitExcedido(
  eventos: readonly Date[],
  params: { limite: number; ventanaMs: number },
  ahora: Date,
): boolean {
  const corte = ahora.getTime() - params.ventanaMs;
  const recientes = eventos.filter((e) => e.getTime() > corte);
  return recientes.length >= params.limite;
}

/** Límites por defecto del antiabuso de reservas. */
export const LIMITES_RESERVAS = {
  /** Reservas creadas por contacto (correo/teléfono normalizado) por hora. */
  porContactoHora: { limite: 6, ventanaMs: 60 * 60_000 },
  /** Reservas creadas por IP por hora y por organización. */
  porIpHora: { limite: 30, ventanaMs: 60 * 60_000 },
  /** Consultas de token por IP por minuto (frena fuerza bruta del enlace). */
  tokenPorIpMinuto: { limite: 20, ventanaMs: 60_000 },
  /** Mutaciones (cancelar/reagendar) por token por hora. */
  gestionPorTokenHora: { limite: 12, ventanaMs: 60 * 60_000 },
} as const;
