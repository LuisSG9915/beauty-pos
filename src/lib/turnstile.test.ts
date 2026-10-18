import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verificarTurnstileToken } from "./turnstile";

describe("verificarTurnstileToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Modo sin secret key (Desarrollo local / CI / E2E)", () => {
    it("retorna true automáticamente si TURNSTILE_SECRET_KEY no está configurada", async () => {
      delete process.env.TURNSTILE_SECRET_KEY;

      const resultadoSinToken = await verificarTurnstileToken(null);
      const resultadoConToken = await verificarTurnstileToken("cualquier-token");

      expect(resultadoSinToken).toBe(true);
      expect(resultadoConToken).toBe(true);
    });
  });

  describe("Modo con secret key configurada (Producción / Edge)", () => {
    const SECRET = "0x4AAAAAAtestsecret";

    beforeEach(() => {
      process.env.TURNSTILE_SECRET_KEY = SECRET;
    });

    it("retorna false si el token no viene definido", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await verificarTurnstileToken(null)).toBe(false);
      expect(await verificarTurnstileToken(undefined)).toBe(false);
      expect(await verificarTurnstileToken("")).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("valida exitosamente cuando la API de Turnstile responde success: true", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            challenge_ts: "2026-10-17T12:00:00.000Z",
            hostname: "melena.app",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const resultado = await verificarTurnstileToken("token-valido-123", "203.0.113.1");

      expect(resultado).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init?.method).toBe("POST");

      const body = init?.body as URLSearchParams;
      expect(body.get("secret")).toBe(SECRET);
      expect(body.get("response")).toBe("token-valido-123");
      expect(body.get("remoteip")).toBe("203.0.113.1");
    });

    it("retorna false cuando la API responde success: false", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const resultado = await verificarTurnstileToken("token-invalido");
      expect(resultado).toBe(false);
    });

    it("retorna false cuando el endpoint responde con error HTTP o lanza excepción de red", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );

      const resultadoHttpError = await verificarTurnstileToken("token-test");
      expect(resultadoHttpError).toBe(false);

      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Timeout de red"));
      const resultadoRedError = await verificarTurnstileToken("token-test");
      expect(resultadoRedError).toBe(false);
    });
  });
});
