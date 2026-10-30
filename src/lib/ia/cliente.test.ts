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
  GLOSARIO_REMISION_BELLEZA_MX,
  IaNoDisponible,
  normalizarAbreviaturasBellezaMexico,
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

describe("normalizarAbreviaturasBellezaMexico", () => {
  it("exporta el glosario de remisiones de belleza en México con equivalencias clave", () => {
    expect(GLOSARIO_REMISION_BELLEZA_MX).toContain("Tte / Tte. = Tinte");
    expect(GLOSARIO_REMISION_BELLEZA_MX).toContain("Deco / Polvo deco = Decolorante");
    expect(GLOSARIO_REMISION_BELLEZA_MX).toContain("Perox / Oxig = Peróxido");
  });

  it("normaliza Tte 8.1 a Tinte 8.1", () => {
    expect(normalizarAbreviaturasBellezaMexico("Tte 8.1")).toBe("Tinte 8.1");
    expect(normalizarAbreviaturasBellezaMexico("Tte. 8.1")).toBe("Tinte 8.1");
  });

  it("normaliza Deco azul 500grs a Decolorante azul 500g", () => {
    expect(normalizarAbreviaturasBellezaMexico("Deco azul 500grs")).toBe("Decolorante azul 500g");
    expect(normalizarAbreviaturasBellezaMexico("Polvo deco 500gr")).toBe("Decolorante 500g");
  });

  it("normaliza Perox 30v 1000mls a Peróxido 30 vol 1000ml", () => {
    expect(normalizarAbreviaturasBellezaMexico("Perox 30v 1000mls")).toBe("Peróxido 30 vol 1000ml");
    expect(normalizarAbreviaturasBellezaMexico("Oxig 20v")).toBe("Peróxido 20 vol");
  });

  it("normaliza Amp keratina 12pzas a Ampolleta keratina 12pz", () => {
    expect(normalizarAbreviaturasBellezaMexico("Amp keratina 12pzas")).toBe("Ampolleta keratina 12pz");
    expect(normalizarAbreviaturasBellezaMexico("Amp. colágeno 1 pza")).toBe("Ampolleta colágeno 1pz");
  });

  it("normaliza shampoo, tratamientos y acrílicos", () => {
    expect(normalizarAbreviaturasBellezaMexico("Sh neutro 1000ml.")).toBe("Shampoo neutro 1000ml");
    expect(normalizarAbreviaturasBellezaMexico("Shamp matizador")).toBe("Shampoo matizador");
    expect(normalizarAbreviaturasBellezaMexico("Trat capilar")).toBe("Tratamiento capilar");
    expect(normalizarAbreviaturasBellezaMexico("Acril cristal 2oz.")).toBe("Acrílico cristal 2oz");
    expect(normalizarAbreviaturasBellezaMexico("Acic rosa")).toBe("Acrílico rosa");
  });

  it("maneja textos vacíos, nulos o cadenas sin abreviaturas sin fallar", () => {
    expect(normalizarAbreviaturasBellezaMexico("")).toBe("");
    expect(normalizarAbreviaturasBellezaMexico(null as unknown as string)).toBe("");
    expect(normalizarAbreviaturasBellezaMexico(undefined as unknown as string)).toBe("");
    expect(normalizarAbreviaturasBellezaMexico("Tijeras profesionales")).toBe("Tijeras profesionales");
  });
});

describe("glosario y post-procesamiento en ejecución IA", () => {
  const esquemaTicketPrueba = z.strictObject({
    lineas: z.array(z.strictObject({ descripcion: z.string(), cantidad: z.number() })),
  });

  it("inyecta el glosario de belleza mexicana cuando la instrucción es de ticket", async () => {
    const run = vi.fn<RunFn>(async () => ({
      response: '{"lineas":[{"descripcion":"Tte 8.1","cantidad":1}]}',
    }));
    env.AI = { run };

    await ejecutarVisionJson({
      modelo: "@cf/meta/llama-4-scout-17b-16e-instruct",
      system: "Eres un asistente que lee tickets",
      instruccion: "Lee el ticket y extrae las líneas",
      jsonSchema: { type: "object" },
      zod: esquemaTicketPrueba,
      imagen: IMAGEN,
    });

    const messages = run.mock.calls[0]![1].messages as { content: Array<{ type: string; text?: string }> }[];
    const textoUsuario = messages[1]!.content[0]!.text ?? "";
    expect(textoUsuario).toContain("Glosario de abreviaturas mexicanas");
  });

  it("aplica normalizarAbreviaturasBellezaMexico a las líneas extraídas por la IA", async () => {
    env.AI = {
      run: vi.fn<RunFn>(async () => ({
        response: {
          lineas: [
            { descripcion: "Tte 8.1", cantidad: 2 },
            { descripcion: "Deco azul 500grs", cantidad: 1 },
            { descripcion: "Perox 30v 1000mls", cantidad: 1 },
          ],
        },
      })),
    };

    const salida = await ejecutarVisionJson({
      modelo: "@cf/meta/llama-4-scout-17b-16e-instruct",
      system: "system ticket",
      instruccion: "instruccion ticket",
      jsonSchema: { type: "object" },
      zod: esquemaTicketPrueba,
      imagen: IMAGEN,
    });

    expect(salida.lineas[0]!.descripcion).toBe("Tinte 8.1");
    expect(salida.lineas[1]!.descripcion).toBe("Decolorante azul 500g");
    expect(salida.lineas[2]!.descripcion).toBe("Peróxido 30 vol 1000ml");
  });

  it("maneja fallback cuando la IA devuelve líneas vacías o respuesta parcial", async () => {
    env.AI = {
      run: vi.fn<RunFn>(async () => ({
        response: {
          lineas: [],
        },
      })),
    };

    const salida = await ejecutarVisionJson({
      modelo: "@cf/meta/llama-4-scout-17b-16e-instruct",
      system: "system ticket",
      instruccion: "instruccion ticket",
      jsonSchema: { type: "object" },
      zod: esquemaTicketPrueba,
      imagen: IMAGEN,
    });

    expect(salida.lineas).toEqual([]);
  });
});
