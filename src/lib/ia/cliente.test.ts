import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

type RunFn = (
  model: string,
  inputs: Record<string, unknown>,
  options?: unknown,
) => Promise<unknown>;

// Entorno Cloudflare simulado: el binding `AI` y la var `AI_GATEWAY_ID`
// se controlan por prueba.
const { env } = vi.hoisted(() => ({
  env: {} as { AI?: { run: RunFn }; AI_GATEWAY_ID?: string },
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env }),
}));

import {
  ejecutarTextoJson,
  ejecutarVisionJson,
  getAi,
  IaNoDisponible,
} from "@/lib/ia/cliente";

const esquemaPrueba = z.strictObject({ nombre: z.string().nullable() });

const OPCIONES = {
  modelo: "@cf/meta/llama-4-scout-17b-16e-instruct",
  system: "system de prueba",
  instruccion: "instrucción de prueba",
  jsonSchema: { type: "object" },
  zod: esquemaPrueba,
};

const IMAGEN = {
  bytes: new Uint8Array([1, 2, 3, 4]).buffer,
  mime: "image/jpeg" as const,
};

describe("getAi", () => {
  beforeEach(() => {
    env.AI = undefined;
    env.AI_GATEWAY_ID = undefined;
  });

  it("devuelve null sin binding y el binding cuando existe", () => {
    expect(getAi()).toBeNull();
    const ai = { run: vi.fn<RunFn>() };
    env.AI = ai;
    expect(getAi()).toBe(ai);
  });
});

describe("ejecutarVisionJson", () => {
  beforeEach(() => {
    env.AI = undefined;
    env.AI_GATEWAY_ID = undefined;
  });

  it("lanza IaNoDisponible sin binding", async () => {
    await expect(
      ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN }),
    ).rejects.toBeInstanceOf(IaNoDisponible);
  });

  it("devuelve el JSON validado cuando response es string", async () => {
    env.AI = { run: vi.fn<RunFn>(async () => ({ response: '{"nombre":"Shampoo"}' })) };
    const salida = await ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN });
    expect(salida).toEqual({ nombre: "Shampoo" });
  });

  it("acepta response ya parseado a objeto", async () => {
    env.AI = { run: vi.fn<RunFn>(async () => ({ response: { nombre: "Crema" } })) };
    const salida = await ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN });
    expect(salida).toEqual({ nombre: "Crema" });
  });

  it("envía messages + response_format json_schema + config determinista", async () => {
    const run = vi.fn<RunFn>(async () => ({ response: '{"nombre":null}' }));
    env.AI = { run };
    await ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN });

    expect(run).toHaveBeenCalledTimes(1);
    const [modelo, inputs, options] = run.mock.calls[0]!;
    expect(modelo).toBe(OPCIONES.modelo);
    expect(options).toBeUndefined();

    const messages = inputs.messages as { role: string; content: unknown }[];
    expect(messages[0]).toEqual({ role: "system", content: OPCIONES.system });
    const contenido = messages[1]!.content as Record<string, unknown>[];
    expect(contenido[0]).toEqual({ type: "text", text: OPCIONES.instruccion });
    expect(contenido[1]!.type).toBe("image_url");
    const imageUrl = (contenido[1] as { image_url: { url: string } }).image_url.url;
    expect(imageUrl.startsWith("data:image/jpeg;base64,")).toBe(true);

    expect(inputs.response_format).toEqual({
      type: "json_schema",
      json_schema: OPCIONES.jsonSchema,
    });
    expect(inputs.temperature).toBe(0.1);
    expect(inputs.max_tokens).toBe(800);
  });

  it("usa AI Gateway solo cuando existe la var AI_GATEWAY_ID", async () => {
    const run = vi.fn<RunFn>(async () => ({ response: '{"nombre":null}' }));
    env.AI = { run };
    env.AI_GATEWAY_ID = "melena-ia";
    await ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN });
    expect(run.mock.calls[0]![2]).toEqual({ gateway: { id: "melena-ia" } });
  });

  it("rechaza cuando el JSON no es válido", async () => {
    env.AI = { run: vi.fn<RunFn>(async () => ({ response: "no es json" })) };
    await expect(
      ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN }),
    ).rejects.toThrow();
  });

  it("rechaza cuando la respuesta no cumple el esquema", async () => {
    env.AI = { run: vi.fn<RunFn>(async () => ({ response: '{"nombre":5}' })) };
    await expect(
      ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN }),
    ).rejects.toThrow();
  });

  it("propaga el error del binding", async () => {
    env.AI = { run: vi.fn<RunFn>(() => Promise.reject(new Error("IA caída"))) };
    await expect(
      ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN }),
    ).rejects.toThrow("IA caída");
  });

  it("rechaza por timeout si el modelo no responde", async () => {
    env.AI = { run: vi.fn<RunFn>(() => new Promise<never>(() => {})) };
    await expect(
      ejecutarVisionJson({ ...OPCIONES, imagen: IMAGEN, timeoutMs: 5 }),
    ).rejects.toThrow("tardó demasiado");
  });
});

describe("ejecutarTextoJson", () => {
  it("envía solo texto (sin image_url)", async () => {
    const run = vi.fn<RunFn>(async () => ({ response: '{"nombre":"ok"}' }));
    env.AI = { run };
    env.AI_GATEWAY_ID = undefined;
    const salida = await ejecutarTextoJson(OPCIONES);
    expect(salida).toEqual({ nombre: "ok" });
    const contenido = (
      run.mock.calls[0]![1].messages as { content: Record<string, unknown>[] }[]
    )[1]!.content;
    expect(contenido).toHaveLength(1);
    expect(contenido[0]).toEqual({ type: "text", text: OPCIONES.instruccion });
  });
});
