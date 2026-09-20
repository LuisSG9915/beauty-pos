/**
 * Reglas puras de la cola de avisos de cita por correo.
 * Todo se decide sobre datos ya cargados para poder probarlos sin BD.
 */

export const TIPO_CONFIRMACION = "confirmacion";
export const TIPO_RECORDATORIO = "recordatorio";
export const TIPO_CAMBIO = "cambio";
export const TIPO_CANCELACION = "cancelacion";
/** Reserva web recibida pendiente de aprobación del negocio. */
export const TIPO_SOLICITUD = "solicitud";

/** Estados de cita en los que un aviso pendiente ya no tiene sentido. */
export const ESTADOS_SIN_AVISO = new Set(["completada", "cancelada", "no_asistio"]);

/** Estados que sí reciben recordatorio previo a la cita. */
const ESTADOS_RECORDABLES = new Set(["pendiente", "confirmada"]);

export const INTENTOS_MAXIMOS = 4;
export const LEASE_MINUTOS = 10;
/** Backoff base: 5 min, duplicándose por intento hasta 60 min. */
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_TOPE_MS = 60 * 60_000;

export type TipoNotificacion =
  | typeof TIPO_CONFIRMACION
  | typeof TIPO_RECORDATORIO
  | typeof TIPO_CAMBIO
  | typeof TIPO_CANCELACION
  | typeof TIPO_SOLICITUD;

export type AvisoPendiente = {
  id: string;
  tipo: string;
  versionCita: number;
  fechaHoraSnapshot: Date;
  programadoPara: Date;
  intentos: number;
};

export type CitaActual = {
  id: string;
  fechaHora: Date;
  estado: string;
  activo: boolean;
  version: number;
  correoCliente: string | null;
};

export type DecisionAviso =
  | { accion: "enviar" }
  | { accion: "omitir"; motivo: string }
  | { accion: "reprogramar"; programadoPara: Date; fechaHoraSnapshot: Date; versionCita: number };

/** Delay exponencial tras un fallo transitorio: 5, 10, 20, 40 min (tope 60). */
export function backoffMs(intentos: number): number {
  const exp = Math.min(Math.max(intentos, 1) - 1, 10);
  return Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_TOPE_MS);
}

export function alcanzoMaximoIntentos(intentos: number): boolean {
  return intentos >= INTENTOS_MAXIMOS;
}

/** Instante en que debe salir el recordatorio de una cita. */
export function instanteRecordatorio(fechaHora: Date, horasAntes: number): Date {
  return new Date(fechaHora.getTime() - horasAntes * 60 * 60_000);
}

/**
 * Decide qué hacer con un aviso pendiente dado el estado ACTUAL de la cita.
 * Es auto-correctivo: nunca envía algo que contradiga la realidad.
 */
export function decidirAviso(
  aviso: AvisoPendiente,
  cita: CitaActual | null,
  params: { ahora: Date; horasAntes: number; margenMinutos?: number },
): DecisionAviso {
  const margenMs = (params.margenMinutos ?? 30) * 60_000;

  if (!cita) return { accion: "omitir", motivo: "La cita ya no existe." };
  if (!cita.correoCliente) return { accion: "omitir", motivo: "El cliente no tiene correo." };

  if (aviso.tipo === TIPO_CANCELACION) {
    // Se envía si la cita sigue cancelada o fue desactivada; si en el interim
    // fue reactivada/reagendada, el aviso de cancelación sobra.
    return cita.estado === "cancelada" || !cita.activo
      ? { accion: "enviar" }
      : { accion: "omitir", motivo: "La cita fue reactivada antes del envío." };
  }

  if (!cita.activo) return { accion: "omitir", motivo: "La cita ya no existe." };

  // Avisos ligados a un momento concreto: si la cita quedó en estado terminal
  // (salvo la cancelación, ya tratada) no se envía nada más.
  if (ESTADOS_SIN_AVISO.has(cita.estado)) {
    return { accion: "omitir", motivo: `La cita está ${cita.estado}.` };
  }

  if (aviso.tipo === TIPO_RECORDATORIO) {
    if (!ESTADOS_RECORDABLES.has(cita.estado)) {
      return { accion: "omitir", motivo: `La cita está ${cita.estado}.` };
    }
    const instanteCorrecto = instanteRecordatorio(cita.fechaHora, params.horasAntes);
    const fechaCambio = cita.fechaHora.getTime() !== aviso.fechaHoraSnapshot.getTime();
    if (fechaCambio || cita.version !== aviso.versionCita) {
      // La cita se movió: el recordatorio se reprograma a la nueva hora.
      if (instanteCorrecto.getTime() > params.ahora.getTime()) {
        return {
          accion: "reprogramar",
          programadoPara: instanteCorrecto,
          fechaHoraSnapshot: cita.fechaHora,
          versionCita: cita.version,
        };
      }
      // La nueva hora ya quedó dentro/pasada la ventana de recordatorio.
      if (cita.fechaHora.getTime() - params.ahora.getTime() <= margenMs) {
        return { accion: "omitir", motivo: "La cita reagendada es inminente o ya pasó." };
      }
    }
    if (cita.fechaHora.getTime() <= params.ahora.getTime()) {
      return { accion: "omitir", motivo: "La cita ya ocurrió." };
    }
    return { accion: "enviar" };
  }

  // confirmacion / cambio: se envían solo si la cita sigue vigente y la fecha
  // no quedó en el pasado (un aviso tardío de una cita vieja confunde).
  if (cita.fechaHora.getTime() <= params.ahora.getTime()) {
    return { accion: "omitir", motivo: "La cita ya ocurrió." };
  }
  // Una solicitud pendiente deja de tener sentido si el negocio ya decidió
  // (confirmada → le llega la confirmación; cancelada → la cancelación).
  if (aviso.tipo === TIPO_SOLICITUD && cita.estado !== "pendiente") {
    return { accion: "omitir", motivo: `La reserva ya fue ${cita.estado}.` };
  }
  if (aviso.tipo === TIPO_CONFIRMACION && cita.version !== aviso.versionCita) {
    // Hubo un cambio posterior (p.ej. reagenda inmediata): el aviso de cambio
    // más reciente refleja la realidad; la confirmación vieja sobra.
    return { accion: "omitir", motivo: "La cita cambió después de la confirmación." };
  }
  if (aviso.tipo === TIPO_CAMBIO && cita.version !== aviso.versionCita) {
    return { accion: "omitir", motivo: "Hay un cambio más reciente de la cita." };
  }
  return { accion: "enviar" };
}

/**
 * Decide si la cita entra en la ventana del escaneo periódico para encolar su
 * recordatorio: recordable, con correo, futura, y cuyo instante de
 * recordatorio cae en `[ahora - margen, ahora + frecuenciaCron)`. El rango hacia
 * atrás recupera citas cuyo instante pasó entre corridas del cron.
 */
export function entraEnVentanaRecordatorio(
  cita: Pick<CitaActual, "fechaHora" | "estado" | "activo" | "correoCliente">,
  params: { ahora: Date; horasAntes: number; margenMinutos?: number; frecuenciaCronMinutos?: number },
): boolean {
  if (!cita.activo || !cita.correoCliente) return false;
  if (!ESTADOS_RECORDABLES.has(cita.estado)) return false;
  if (cita.fechaHora.getTime() <= params.ahora.getTime()) return false;
  const instante = instanteRecordatorio(cita.fechaHora, params.horasAntes).getTime();
  const margenMs = (params.margenMinutos ?? 30) * 60_000;
  const frecuenciaMs = (params.frecuenciaCronMinutos ?? 30) * 60_000;
  const ahora = params.ahora.getTime();
  // Ya enviable ahora mismo, o dentro del próximo tramo del cron.
  return instante <= ahora + frecuenciaMs && instante >= ahora - margenMs;
}
