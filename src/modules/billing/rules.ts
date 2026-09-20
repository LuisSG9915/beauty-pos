/**
 * Reglas puras del estado de suscripción. Nada de I/O: toman la suscripción
 * ya cargada y la fecha actual para poder probarlas sin base de datos.
 */

export type SuscripcionEstado = "trialing" | "activa" | "past_due" | "cancelada" | "vencida";

export type SuscripcionVista = {
  estado: SuscripcionEstado | string;
  trialTerminaAt: Date | null;
  periodoTerminaAt: Date | null;
};

/** Estado operativo efectivo de la suscripción en `ahora`. */
export type EstadoEfectivo = "vigente" | "vencida";

/**
 * - Sin suscripción → `vigente` (organizaciones históricas/manuales no se
 *   bloquean retroactivamente).
 * - `trialing` vigente solo hasta `trial_termina_at`.
 * - `activa`/`past_due` vigentes hasta `periodo_termina_at` (null = sin corte).
 * - `cancelada`/`vencida` → vencida.
 */
export function estadoEfectivoSuscripcion(
  suscripcion: SuscripcionVista | null | undefined,
  ahora: Date = new Date(),
): EstadoEfectivo {
  if (!suscripcion) return "vigente";
  if (suscripcion.estado === "trialing") {
    return suscripcion.trialTerminaAt && suscripcion.trialTerminaAt.getTime() > ahora.getTime()
      ? "vigente"
      : "vencida";
  }
  if (suscripcion.estado === "activa" || suscripcion.estado === "past_due") {
    return !suscripcion.periodoTerminaAt || suscripcion.periodoTerminaAt.getTime() > ahora.getTime()
      ? "vigente"
      : "vencida";
  }
  return "vencida";
}

/** Días completos que restan del trial (0 si ya venció o no hay fecha). */
export function diasRestantesTrial(
  suscripcion: SuscripcionVista | null | undefined,
  ahora: Date = new Date(),
): number | null {
  if (!suscripcion || suscripcion.estado !== "trialing" || !suscripcion.trialTerminaAt) return null;
  const restante = suscripcion.trialTerminaAt.getTime() - ahora.getTime();
  return Math.max(0, Math.ceil(restante / (1000 * 60 * 60 * 24)));
}

/**
 * Permisos permitidos cuando la suscripción venció: solo lectura.
 * Lecturas (`*.ver`) y reportes siguen disponibles para que la persona pueda
 * consultar su información antes de reactivar; toda escritura se bloquea.
 */
export function esPermisoSoloLectura(clave: string): boolean {
  return clave.endsWith(".ver") || clave.startsWith("reportes.");
}
