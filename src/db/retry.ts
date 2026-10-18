/**
 * Reintento acotado para transacciones de CockroachDB. Bajo aislamiento
 * SERIALIZABLE los conflictos concurrentes abortan con SQLSTATE 40001
 * (serialization failure) u ocasionalmente 40P01 (deadlock); ambos son
 * seguros de reintentar porque la transacción no aplicó cambios.
 */

const RETRYABLE_CODES = new Set(["40001", "40P01"]);

type MaybePgError = { code?: string; cause?: unknown };

function errorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  // node-postgres anida el error del servidor en `cause`/`errors` según el caso.
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as MaybePgError).code;
    if (typeof code === "string") return code;
    current = (current as MaybePgError).cause;
  }
  return undefined;
}

export function isRetryableDbError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RETRYABLE_CODES.has(code);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type DbRetryOptions = {
  /** Intentos totales (incluye el primero). */
  attempts?: number;
  /** Backoff base en ms; crece exponencial con jitter. */
  baseDelayMs?: number;
  /** Se invoca antes de cada reintento (logging/métricas). */
  onRetry?: (error: unknown, attempt: number) => void;
};

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: DbRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 30;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === attempts) throw error;
      options.onRetry?.(error, attempt);
      const jitter = Math.random() * baseDelay;
      await sleep(baseDelay * 2 ** (attempt - 1) + jitter);
    }
  }
  throw lastError;
}

export const withRetry = withDbRetry;
