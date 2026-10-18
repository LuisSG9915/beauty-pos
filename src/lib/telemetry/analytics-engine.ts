import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getRuntimeEnv } from "@/lib/runtime-env";

export type NavigationTelemetryPoint = {
  ruta: string;
  duracionMs: number;
  ttfbMs?: number;
  organizacionId?: string | null;
  rol?: string | null;
  dispositivo?: string | null;
};

export type ProductTelemetryPoint = {
  evento: string;
  modulo: string;
  organizacionId: string;
  sucursalId?: string | null;
  rol?: string | null;
  duracionMs?: number | null;
};

type AnalyticsEngineBinding = {
  writeDataPoint(event?: {
    indexes?: ((ArrayBuffer | string) | null)[];
    doubles?: number[];
    blobs?: ((ArrayBuffer | string) | null)[];
  }): void;
};

function getTelemetryAeBinding(): AnalyticsEngineBinding | null {
  try {
    const context = getCloudflareContext({ async: false }) as {
      env?: {
        TELEMETRY_AE?: AnalyticsEngineBinding;
      };
    } | null;

    const ae = context?.env?.TELEMETRY_AE;
    if (ae && typeof ae.writeDataPoint === "function") {
      return ae;
    }
  } catch {
    // Fuera del entorno de Cloudflare Workers (desarrollo local / Vitest)
  }
  return null;
}

/**
 * Escribe un punto de telemetría de navegación en Workers Analytics Engine.
 * Escribe síncronamente en <1 ms en Cloudflare Edge.
 * Retorna true si se escribió en Analytics Engine, o false si el binding no está disponible.
 */
export function writeNavigationTelemetry(point: NavigationTelemetryPoint): boolean {
  const ae = getTelemetryAeBinding();
  if (!ae) {
    return false;
  }

  try {
    ae.writeDataPoint({
      indexes: [point.organizacionId ?? "anon"],
      blobs: [
        "nav",
        point.ruta,
        point.organizacionId ?? "",
        point.rol ?? "",
        point.dispositivo ?? "",
      ],
      doubles: [point.duracionMs, point.ttfbMs ?? 0],
    });
    return true;
  } catch (error) {
    console.error("[analytics-engine] Error writing navigation telemetry:", error);
    return false;
  }
}

/**
 * Escribe un punto de telemetría de producto en Workers Analytics Engine.
 * Retorna true si se escribió en Analytics Engine, o false si el binding no está disponible.
 */
export function writeProductTelemetry(point: ProductTelemetryPoint): boolean {
  const ae = getTelemetryAeBinding();
  if (!ae) {
    return false;
  }

  try {
    ae.writeDataPoint({
      indexes: [point.organizacionId],
      blobs: [
        "prod",
        point.evento,
        point.modulo,
        point.organizacionId,
        point.sucursalId ?? "",
        point.rol ?? "",
      ],
      doubles: [point.duracionMs ?? 0, 1],
    });
    return true;
  } catch (error) {
    console.error("[analytics-engine] Error writing product telemetry:", error);
    return false;
  }
}

/**
 * Consulta la SQL API de Cloudflare Workers Analytics Engine.
 * Retorna array de filas parseadas si las variables están configuradas y la consulta fue exitosa,
 * o null si no están configuradas o hubo un error (permitiendo fallback a base de datos).
 */
export async function queryAnalyticsEngine<T = Record<string, unknown>>(
  sqlQuery: string,
): Promise<T[] | null> {
  const env = getRuntimeEnv();
  const accountId = env.CF_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN_ANALYTICS ?? process.env.CF_API_TOKEN_ANALYTICS;

  if (!accountId || !apiToken) {
    return null;
  }

  try {
    const formattedQuery = sqlQuery.trim().endsWith("FORMAT JSON")
      ? sqlQuery.trim()
      : `${sqlQuery.trim()} FORMAT JSON`;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "text/plain",
        },
        body: formattedQuery,
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      console.error(
        "[analytics-engine] SQL query failed:",
        response.status,
        await response.text().catch(() => ""),
      );
      return null;
    }

    const json = (await response.json()) as { data?: T[] };
    return json.data ?? [];
  } catch (error) {
    console.error("[analytics-engine] Error querying SQL API:", error);
    return null;
  }
}
