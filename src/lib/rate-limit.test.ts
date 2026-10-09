import { describe, expect, it } from "vitest";
import { registrarYVerificarRateLimit } from "./rate-limit";

describe("rate-limit (KV / memoria fallback)", () => {
  it("permite llamadas dentro del límite", async () => {
    const clave = `test-user-${Date.now()}`;
    const ahora = new Date();

    const excede1 = await registrarYVerificarRateLimit(
      { bucket: "test", clave, limite: 3, ventanaMs: 60_000 },
      ahora,
    );
    expect(excede1).toBe(false);

    const excede2 = await registrarYVerificarRateLimit(
      { bucket: "test", clave, limite: 3, ventanaMs: 60_000 },
      ahora,
    );
    expect(excede2).toBe(false);

    const excede3 = await registrarYVerificarRateLimit(
      { bucket: "test", clave, limite: 3, ventanaMs: 60_000 },
      ahora,
    );
    expect(excede3).toBe(false);
  });

  it("bloquea cuando se supera el límite", async () => {
    const clave = `test-blocked-${Date.now()}`;
    const ahora = new Date();

    // 2 permitidas
    await registrarYVerificarRateLimit(
      { bucket: "test_block", clave, limite: 2, ventanaMs: 60_000 },
      ahora,
    );
    await registrarYVerificarRateLimit(
      { bucket: "test_block", clave, limite: 2, ventanaMs: 60_000 },
      ahora,
    );

    // 3a debe exceder
    const excede = await registrarYVerificarRateLimit(
      { bucket: "test_block", clave, limite: 2, ventanaMs: 60_000 },
      ahora,
    );
    expect(excede).toBe(true);
  });

  it("resetea tras vencer la ventana de tiempo", async () => {
    const clave = `test-reset-${Date.now()}`;
    const inicio = new Date(1_000_000);

    // Agotar límite
    await registrarYVerificarRateLimit(
      { bucket: "test_reset", clave, limite: 1, ventanaMs: 10_000 },
      inicio,
    );
    const bloqueado = await registrarYVerificarRateLimit(
      { bucket: "test_reset", clave, limite: 1, ventanaMs: 10_000 },
      inicio,
    );
    expect(bloqueado).toBe(true);

    // Avanzar más allá de la ventana (+15 s)
    const despues = new Date(inicio.getTime() + 15_000);
    const permitidoNuevamente = await registrarYVerificarRateLimit(
      { bucket: "test_reset", clave, limite: 1, ventanaMs: 10_000 },
      despues,
    );
    expect(permitidoNuevamente).toBe(false);
  });
});
