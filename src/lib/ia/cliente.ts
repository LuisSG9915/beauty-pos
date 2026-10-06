import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { z } from "zod";

/**
 * Acceso compartido a Workers AI (binding `AI` en wrangler.jsonc) para las
 * capturas asistidas por IA (planes 08, 10 y 12). Mismo patrón que
 * `src/lib/kv-cache.ts`: `null` fuera de Workers (next dev, scripts) y los
 * consumidores degradan a "no disponible".
 */

type RuntimeEnv = {
  AI?: Ai;
  /** Id de AI Gateway (`melena-ia`); si no existe se llama directo al binding. */
  AI_GATEWAY_ID?: string;
};

function envIa(): RuntimeEnv {
  try {
    const context = getCloudflareContext({ async: false }) as { env: RuntimeEnv } | null;
    return context?.env ?? {};
  } catch {
    return {};
  }
}

/** Binding `AI` del Worker; `null` fuera de Cloudflare. */
export function getAi(): Ai | null {
  return envIa().AI ?? null;
}

/** El binding `AI` no existe en este entorno (dev local sin wrangler). */
export class IaNoDisponible extends Error {
  constructor() {
    super("La captura con IA no está disponible en este entorno.");
    this.name = "IaNoDisponible";
  }
}

const MAX_TOKENS_DEFAULT = 800;
const TIMEOUT_MS_DEFAULT = 45_000;
const TEMPERATURA = 0.1;

/** ArrayBuffer → base64 por bloques (spread directo desborda la pila >64 KB). */
function aBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const BLOQUE = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + BLOQUE));
  }
  return btoa(binario);
}

/**
 * La salida del modelo llega como `{ response: string }` (texto JSON) u —en
 * algunos modelos— ya como objeto parseado. Devuelve el valor listo para
 * `zod.parse` o lanza si el JSON no es válido.
 */
function extraerJson(salida: unknown): unknown {
  const payload =
    salida && typeof salida === "object" && "response" in salida
      ? (salida as { response?: unknown }).response
      : salida;
  if (typeof payload === "string") return JSON.parse(payload);
  return payload;
}

type OpcionesBase<T> = {
  modelo: string;
  system: string;
  instruccion: string;
  jsonSchema: Record<string, unknown>;
  zod: z.ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
};

async function ejecutar<T>(
  opts: OpcionesBase<T>,
  imagen?: { bytes: ArrayBuffer; mime: "image/jpeg" | "image/png" },
): Promise<T> {
  const env = envIa();
  const ai = env.AI;
  if (!ai) throw new IaNoDisponible();

  const contenidoUsuario: Record<string, unknown>[] = [
    { type: "text", text: opts.instruccion },
  ];
  if (imagen) {
    contenidoUsuario.push({
      type: "image_url",
      image_url: { url: `data:${imagen.mime};base64,${aBase64(imagen.bytes)}` },
    });
  }

  const inputs = {
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: contenidoUsuario },
    ],
    response_format: { type: "json_schema", json_schema: opts.jsonSchema },
    temperature: TEMPERATURA,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_DEFAULT,
  };

  const options: AiOptions | undefined = env.AI_GATEWAY_ID
    ? { gateway: { id: env.AI_GATEWAY_ID } }
    : undefined;

  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS_DEFAULT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("La lectura con IA tardó demasiado.")),
      timeoutMs,
    );
  });

  try {
    const salida = await Promise.race([
      (ai.run as (
        model: string,
        inputs: Record<string, unknown>,
        options?: AiOptions,
      ) => Promise<unknown>)(opts.modelo, inputs, options),
      limite,
    ]);
    return opts.zod.parse(extraerJson(salida));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Visión + JSON guiado: envía texto e imagen al modelo y devuelve la respuesta
 * validada por `zod`. Lanza `IaNoDisponible` sin binding, `Error` en timeout o
 * `ZodError`/`SyntaxError` si la respuesta no cumple el esquema.
 */
export function ejecutarVisionJson<T>(
  opts: OpcionesBase<T> & {
    imagen: { bytes: ArrayBuffer; mime: "image/jpeg" | "image/png" };
  },
): Promise<T> {
  const { imagen, ...resto } = opts;
  return ejecutar(resto, imagen);
}

/** Igual que `ejecutarVisionJson` pero solo con texto (planes 10 y 12). */
export function ejecutarTextoJson<T>(opts: OpcionesBase<T>): Promise<T> {
  return ejecutar(opts);
}
