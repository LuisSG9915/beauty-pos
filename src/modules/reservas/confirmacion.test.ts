import { describe, expect, it } from "vitest";

import { resolverConfirmacion } from "./rules";

describe("resolverConfirmacion", () => {
  it("confirma una cita pendiente que el panel ya programó", () => {
    expect(resolverConfirmacion({ estado: "pendiente", activo: true, origen: "panel" })).toEqual({ accion: "confirmar" });
  });

  it("es idempotente si la cita ya estaba confirmada", () => {
    expect(resolverConfirmacion({ estado: "confirmada", activo: true, origen: "web" })).toEqual({ accion: "ya_confirmada" });
  });

  it("no deja que la clienta apruebe una reserva web que espera al negocio", () => {
    expect(resolverConfirmacion({ estado: "pendiente", activo: true, origen: "web" })).toEqual({
      accion: "rechazar",
      motivo: "Tu reserva todavía espera la aprobación del negocio. Te avisaremos por correo cuando la confirmen.",
    });
  });

  it("rechaza citas canceladas, atendidas u ocultas", () => {
    expect(resolverConfirmacion({ estado: "cancelada", activo: true, origen: "panel" })).toEqual({
      accion: "rechazar",
      motivo: "Esta cita ya no se puede confirmar en línea. Comunícate con el negocio.",
    });
    expect(resolverConfirmacion({ estado: "completada", activo: true, origen: "panel" }).accion).toBe("rechazar");
    expect(resolverConfirmacion({ estado: "pendiente", activo: false, origen: "panel" })).toEqual({
      accion: "rechazar",
      motivo: "Esta cita ya no está disponible.",
    });
  });
});
