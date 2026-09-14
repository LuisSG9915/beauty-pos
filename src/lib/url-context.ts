/**
 * Helpers para construir URLs del panel preservando el contexto de la URL
 * (organizationId, sucursalId) y normalizar parámetros de búsqueda.
 */
import { isValidDateInput } from "@/lib/format";

/** Parámetros que representan el contexto de navegación del panel. */
export const CONTEXT_PARAMS = ["organizationId", "sucursalId"] as const;
export type ContextParam = (typeof CONTEXT_PARAMS)[number];

type SearchParamsLike =
  | URLSearchParams
  | Readonly<URLSearchParams>
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

/**
 * Devuelve el primer valor de un parámetro de búsqueda (string | string[]),
 * recortado; `undefined` si está vacío o ausente.
 */
export function firstParam(
  value: string | string[] | null | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function readParam(source: SearchParamsLike, key: string): string | undefined {
  if (!source) return undefined;
  if (typeof (source as URLSearchParams).get === "function") {
    return firstParam((source as URLSearchParams).get(key));
  }
  return firstParam(
    (source as Record<string, string | string[] | undefined>)[key],
  );
}

export type BuildHrefOptions = {
  /** Sobrescribe organizationId; `null`/`""` lo eliminan. */
  organizationId?: string | null;
  /** Sobrescribe sucursalId; `null`/`""` lo eliminan. */
  sucursalId?: string | null;
  /**
   * Fuente de parámetros a preservar: el resultado de `useSearchParams()`,
   * `searchParams` ya resueltos en una page, o un `URLSearchParams`.
   */
  params?: SearchParamsLike;
  /** Claves adicionales a preservar desde `params` (además de CONTEXT_PARAMS). */
  preserve?: readonly string[];
  /** Valores extra a fijar; `null`/`undefined`/`""` eliminan la clave. */
  extra?: Record<string, string | number | null | undefined>;
};

/**
 * Construye un href preservando organizationId/sucursalId (y cualquier clave
 * listada en `preserve`) desde `params`, aplicando las sobrescrituras
 * explícitas al final.
 */
export function buildHref(
  pathname: string,
  options: BuildHrefOptions = {},
): string {
  const search = new URLSearchParams();
  const preserve = new Set<string>([
    ...CONTEXT_PARAMS,
    ...(options.preserve ?? []),
  ]);

  for (const key of preserve) {
    const value = readParam(options.params, key);
    if (value) search.set(key, value);
  }

  if (options.organizationId !== undefined) {
    if (options.organizationId) search.set("organizationId", options.organizationId);
    else search.delete("organizationId");
  }
  if (options.sucursalId !== undefined) {
    if (options.sucursalId) search.set("sucursalId", options.sucursalId);
    else search.delete("sucursalId");
  }
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    if (value === null || value === undefined || value === "") {
      search.delete(key);
    } else {
      search.set(key, String(value));
    }
  }

  const queryString = search.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

/**
 * Atajo para rutas del panel: `buildAdminHref("/agenda", opts)` →
 * `/admin/agenda?organizationId=…`.
 */
export function buildAdminHref(
  path: `/${string}` | "",
  options: BuildHrefOptions = {},
): string {
  return buildHref(`/admin${path}`, options);
}

/**
 * Normaliza un parámetro `YYYY-MM-DD`. Devuelve `fallback` (o `undefined`)
 * cuando el valor no es una fecha válida.
 */
export function normalizeDateInput(
  value: string | string[] | null | undefined,
  fallback?: string,
): string | undefined {
  const raw = firstParam(value);
  return raw && isValidDateInput(raw) ? raw : fallback;
}

/**
 * Normaliza un parámetro contra una lista de vistas permitidas.
 */
export function normalizeView<TView extends string>(
  value: string | string[] | null | undefined,
  allowed: readonly TView[],
  fallback: TView,
): TView {
  const raw = firstParam(value);
  return raw !== undefined && (allowed as readonly string[]).includes(raw)
    ? (raw as TView)
    : fallback;
}
