/**
 * Utilidades de zona horaria sin dependencias externas.
 *
 * La agenda interpreta `datetime-local` como hora de muro de la sucursal, no del
 * servidor. Todo pasa por `Intl.DateTimeFormat` (cacheado por zona IANA) para
 * soportar offsets variables y transiciones DST.
 */

export const DEFAULT_TIME_ZONE = "America/Mexico_City";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Devuelve la primera zona IANA válida o `DEFAULT_TIME_ZONE`. */
export function resolveTimeZone(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate && isValidTimeZone(candidate)) return candidate;
  }
  return DEFAULT_TIME_ZONE;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export interface ZonedParts {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 0-59 */
  second: number;
  /** 0=domingo … 6=sábado (convención JS, igual que horarios_sucursales.dia_semana). */
  diaSemana: number;
  /** "YYYY-MM-DD" en la zona indicada. */
  dayKey: string;
  /** Minutos transcurridos desde medianoche local. */
  minutosDelDia: number;
}

/** Descompone un instante UTC en sus partes de hora de muro en `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let diaSemana = 0;
  for (const part of parts) {
    switch (part.type) {
      case "year":
        year = Number(part.value);
        break;
      case "month":
        month = Number(part.value);
        break;
      case "day":
        day = Number(part.value);
        break;
      case "hour":
        hour = Number(part.value);
        break;
      case "minute":
        minute = Number(part.value);
        break;
      case "second":
        second = Number(part.value);
        break;
      case "weekday":
        diaSemana = WEEKDAY_INDEX[part.value] ?? 0;
        break;
    }
  }
  // Algunos motores reportan medianoche como 24 aun con hourCycle h23.
  if (hour === 24) hour = 0;
  const dayKey = `${year}-${pad2(month)}-${pad2(day)}`;
  return { year, month, day, hour, minute, second, diaSemana, dayKey, minutosDelDia: hour * 60 + minute };
}

/** "YYYY-MM-DD" del instante `date` visto en `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  return getZonedParts(date, timeZone).dayKey;
}

/**
 * Offset en ms que hay que SUMAR a un instante UTC para leer su hora de muro en
 * `timeZone` (p.ej. -6h para America/Mexico_City). Se recalcula por instante, así
 * que cambios de offset (DST) se reflejan correctamente.
 */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Interpreta un `datetime-local` ("YYYY-MM-DDTHH:mm[:ss]") como hora de muro en
 * `timeZone` y devuelve el instante UTC correspondiente.
 *
 * El offset se resuelve iterativamente porque puede cambiar entre la hora de
 * muro pedida y el instante resultante (transiciones DST). Si la hora de muro no
 * existe (gap de primavera), se devuelve el instante posterior equivalente
 * ("fall forward"), igual que `Temporal` con disambiguation "compatible".
 * Devuelve `null` si el formato o la fecha son inválidos.
 */
export function localDateTimeToUtc(input: string, timeZone: string): Date | null {
  const match = LOCAL_RE.exec(input.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  const naiveMs = Date.UTC(year, month - 1, day, hour, minute, second);
  // Date.UTC normaliza desbordes (p.ej. 31 de febrero): verificar ida y vuelta.
  const check = new Date(naiveMs);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let guess = naiveMs;
  for (let i = 0; i < 5; i++) {
    const next = naiveMs - timeZoneOffsetMs(new Date(guess), timeZone);
    if (next === guess) return new Date(guess);
    guess = next;
  }
  // Sin convergencia: la hora de muro cae en un gap DST y los candidatos oscilan
  // a ambos lados del salto. Preferimos el instante posterior.
  const alternate = naiveMs - timeZoneOffsetMs(new Date(guess), timeZone);
  return new Date(Math.max(guess, alternate));
}

/** Cota [inicio, fin) en UTC del día local `day` ("YYYY-MM-DD") en `timeZone`. */
export function dayBoundsUtc(day: string, timeZone: string): { iniciaAt: Date; terminaAt: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const iniciaAt = localDateTimeToUtc(`${match[1]}-${match[2]}-${match[3]}T00:00`, timeZone);
  if (!iniciaAt) return null;
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  const nextKey = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  const terminaAt = localDateTimeToUtc(`${nextKey}T00:00`, timeZone);
  if (!terminaAt) return null;
  return { iniciaAt, terminaAt };
}

/**
 * Suma `amount` días calendario a una clave `YYYY-MM-DD`. Devuelve `null` si la
 * fecha base no es válida.
 */
export function shiftDateKey(day: string, amount: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount));
  const check = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (check.getUTCFullYear() !== Number(match[1]) || check.getUTCMonth() !== Number(match[2]) - 1 || check.getUTCDate() !== Number(match[3])) return null;
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Devuelve la clave `YYYY-MM-DD` del inicio de semana que contiene `day`, según
 * el día de semana local en `timeZone`. Por defecto la semana inicia en lunes.
 */
export function weekStartDateKey(day: string, timeZone: string, weekStartsOn = 1): string | null {
  const noon = localDateTimeToUtc(`${day}T12:00`, timeZone);
  if (!noon) return null;
  const diaSemana = getZonedParts(noon, timeZone).diaSemana;
  const delta = (diaSemana - weekStartsOn + 7) % 7;
  return shiftDateKey(day, -delta);
}

const HAS_EXPLICIT_ZONE_RE = /(z|[+-]\d{2}:?\d{2})$/i;

/**
 * Punto único para interpretar `fechaHora` recibido de la UI:
 * - Cadenas con zona explícita (ISO 8601 con Z u offset) se parsean directo.
 * - `datetime-local` sin zona se interpreta como hora de muro en `timeZone`.
 *
 * `timeZone` se resuelve con `resolveTimeZone`: en la BD `sucursales.zona_horaria`
 * es nullable y una zona ausente o inválida reventaba el parseo (la cita no se
 * podía guardar). El fallback es la zona por defecto del producto.
 */
export function parseFechaHoraInput(raw: string, timeZone?: string | null): Date | null {
  const value = raw.trim();
  if (!value) return null;
  if (HAS_EXPLICIT_ZONE_RE.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return localDateTimeToUtc(value, resolveTimeZone(timeZone));
}
