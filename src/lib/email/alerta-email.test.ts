import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enviarAlertaIncidenteCritico } from "./alerta-email";

describe("alerta-email", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("no envía nada si BREVO_API_KEY no está configurada", async () => {
    delete process.env.BREVO_API_KEY;
    process.env.BREVO_FROM_EMAIL = "alerts@melena.app";

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await enviarAlertaIncidenteCritico({
      to: "admin@melena.app",
      titulo: "Error de cobro",
      ruta: "/admin/pos",
      fingerprint: "abc12345",
      prioridad: "P0",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("envía correo a través de la API de Brevo cuando está configurada", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.BREVO_FROM_EMAIL = "alerts@melena.app";
    process.env.BREVO_FROM_NAME = "Melena Alerts";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => "OK",
    } as Response);

    await enviarAlertaIncidenteCritico({
      to: "oncall@melena.app",
      titulo: "Fallo crítico en base de datos",
      ruta: "/admin/pos/cobro",
      fingerprint: "fp-critical-99",
      cfRay: "ray-123456789",
      prioridad: "P0",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": "test-brevo-key",
          "content-type": "application/json",
        }),
      }),
    );

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.to).toEqual([{ email: "oncall@melena.app" }]);
    expect(callBody.subject).toContain("[ALERTA P0]");
    expect(callBody.htmlContent).toContain("fp-critical-99");
    expect(callBody.htmlContent).toContain("ray-123456789");

    fetchSpy.mockRestore();
  });

  it("lanza un error descriptivo si Brevo responde con error", async () => {
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.BREVO_FROM_EMAIL = "alerts@melena.app";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    await expect(
      enviarAlertaIncidenteCritico({
        to: "oncall@melena.app",
        titulo: "Error",
        ruta: "/admin",
        fingerprint: "fp",
        prioridad: "P1",
      }),
    ).rejects.toThrow("Brevo alert email failed (401)");

    fetchSpy.mockRestore();
  });
});
