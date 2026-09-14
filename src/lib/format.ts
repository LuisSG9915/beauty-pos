/**
 * Utilidades de formato compartidas para la UI de administración.
 * Moneda por defecto: MXN. Zona horaria por defecto: America/Mexico_City.
 */

export const DEFAULT_TIME_ZONE = "America/Mexico_City";
export const DEFAULT_LOCALE = "es-MX";
export const EMPTY_VALUE = "—";

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FormatOptions = {
  locale?: string;
  timeZone?: string;
};

/**
 * Valida una cadena con formato `YYYY-MM-DD` (input type="date").
 */
export function isValidDateInput(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_INPUT_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Convierte un valor a `Date`. Las cadenas `YYYY-MM-DD` se interpretan como
 * fecha de calendario (mediodía UTC evita corrimientos por zona horaria).
 * Devuelve `null` cuando el valor no es parseable.
 */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && DATE_INPUT_RE.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formatea un monto como moneda. Por defecto MXN en es-MX.
 * Devuelve "—" para valores vacíos o no numéricos.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options: { locale?: string; currency?: string } = {},
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return EMPTY_VALUE;
  }
  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency: options.currency ?? "MXN",
  }).format(amount);
}

/**
 * Formatea una fecha sin hora (p. ej. "15 ene 2025").
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  options: FormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date);
}

/**
 * Formatea solo la hora (p. ej. "13:30").
 */
export function formatTime(
  value: Date | string | number | null | undefined,
  options: FormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date);
}

/**
 * Formatea fecha y hora (p. ej. "15 ene 2025, 13:30").
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  options: FormatOptions = {},
): string {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date);
}

/**
 * Fecha de hoy en formato `YYYY-MM-DD` para inputs type="date".
 */
export function todayDateInput(timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}
