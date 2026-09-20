/**
 * Reglas puras del envío de recordatorios de cita por correo.
 * Todo se decide sobre datos ya cargados para poder probarlos sin BD.
 */

export const TIPO_RECORDATORIO_CITA = "cita_24h";

/** Estados de cita que sí reciben recordatorio (las demás ya no ocurrirán). */
const ESTADOS_RECORDABLES = new Set(["pendiente", "confirmada"]);

export type CitaParaRecordatorio = {
  id: string;
  fechaHora: Date;
  estado: string;
  activo: boolean;
  correoCliente: string | null;
  /** true si ya existe un envío registrado para esta cita+tipo. */
  yaEnviada: boolean;
};

/**
 * Decide si la cita entra en la ventana de envío: recordable, con correo,
 * sin envío previo, y cuya fecha cae en `[ahora+horasAntes-margen,
 * ahora+horasAntes+margen)`. El margen absorbe la frecuencia del cron para
 * no saltarse citas entre corridas.
 */
export function debeEnviarRecordatorio(
  cita: CitaParaRecordatorio,
  params: { ahora: Date; horasAntes: number; margenMinutos?: number },
): boolean {
  if (!cita.activo || cita.yaEnviada || !cita.correoCliente) return false;
  if (!ESTADOS_RECORDABLES.has(cita.estado)) return false;
  const margenMs = (params.margenMinutos ?? 30) * 60_000;
  const objetivo = params.ahora.getTime() + params.horasAntes * 60 * 60_000;
  const inicio = objetivo - margenMs;
  const fin = objetivo + margenMs;
  const t = cita.fechaHora.getTime();
  return t >= inicio && t < fin;
}

export function horasAntesValidas(horas: number): boolean {
  return Number.isInteger(horas) && horas >= 1 && horas <= 168; // hasta 7 días
}
