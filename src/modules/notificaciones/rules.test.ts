import { describe, expect, it } from "vitest";

import {
  alcanzoMaximoIntentos,
  backoffMs,
  decidirAviso,
  entraEnVentanaRecordatorio,
  instanteRecordatorio,
  INTENTOS_MAXIMOS,
  TIPO_CAMBIO,
  TIPO_CANCELACION,
  TIPO_CONFIRMACION,
  TIPO_RECORDATORIO,
  TIPO_SOLICITUD,
  type AvisoPendiente,
  type CitaActual,
} from "./rules";

const AHORA = new Date("2026-10-01T15:00:00Z");
const EN_24H = new Date("2026-10-02T15:00:00Z");

function aviso(partial: Partial<AvisoPendiente> = {}): AvisoPendiente {
  return {
    id: "aviso-1",
    tipo: TIPO_RECORDATORIO,
    versionCita: 1,
    fechaHoraSnapshot: EN_24H,
    programadoPara: AHORA,
    intentos: 0,
    ...partial,
  };
}

function cita(partial: Partial<CitaActual> = {}): CitaActual {
  return {
    id: "cita-1",
    fechaHora: EN_24H,
    estado: "confirmada",
    activo: true,
    version: 1,
    correoCliente: "cliente@test.dev",
    ...partial,
  };
}

const PARAMS = { ahora: AHORA, horasAntes: 24 };

describe("backoffMs", () => {
  it("crece exponencialmente y se topa en 60 min", () => {
    expect(backoffMs(1)).toBe(5 * 60_000);
    expect(backoffMs(2)).toBe(10 * 60_000);
    expect(backoffMs(3)).toBe(20 * 60_000);
    expect(backoffMs(4)).toBe(40 * 60_000);
    expect(backoffMs(5)).toBe(60 * 60_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});

describe("alcanzoMaximoIntentos", () => {
  it("marca el límite en INTENTOS_MAXIMOS", () => {
    expect(alcanzoMaximoIntentos(INTENTOS_MAXIMOS - 1)).toBe(false);
    expect(alcanzoMaximoIntentos(INTENTOS_MAXIMOS)).toBe(true);
    expect(alcanzoMaximoIntentos(INTENTOS_MAXIMOS + 3)).toBe(true);
  });
});

describe("instanteRecordatorio", () => {
  it("resta las horas configuradas", () => {
    expect(instanteRecordatorio(EN_24H, 24).toISOString()).toBe(AHORA.toISOString());
    expect(instanteRecordatorio(EN_24H, 2).toISOString()).toBe("2026-10-02T13:00:00.000Z");
  });
});

describe("decidirAviso — casos comunes", () => {
  it("omite cuando la cita ya no existe", () => {
    expect(decidirAviso(aviso(), null, PARAMS)).toEqual({ accion: "omitir", motivo: "La cita ya no existe." });
  });

  it("omite cuando el cliente no tiene correo", () => {
    const decision = decidirAviso(aviso(), cita({ correoCliente: null }), PARAMS);
    expect(decision.accion).toBe("omitir");
  });

  it("omite cualquier aviso si la cita quedó en estado terminal", () => {
    for (const estado of ["completada", "no_asistio"]) {
      const decision = decidirAviso(aviso({ tipo: TIPO_CONFIRMACION }), cita({ estado }), PARAMS);
      expect(decision.accion).toBe("omitir");
    }
  });

  it("omite confirmación si la cita ya ocurrió", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CONFIRMACION }),
      cita({ fechaHora: new Date("2026-09-30T10:00:00Z") }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });
});

describe("decidirAviso — cancelación", () => {
  it("envía la cancelación aunque la cita quede desactivada", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CANCELACION }),
      cita({ activo: false }),
      PARAMS,
    );
    expect(decision).toEqual({ accion: "enviar" });
  });

  it("envía la cancelación si la cita sigue cancelada", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CANCELACION }),
      cita({ estado: "cancelada" }),
      PARAMS,
    );
    expect(decision).toEqual({ accion: "enviar" });
  });

  it("omite la cancelación si la cita fue reactivada antes del envío", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CANCELACION }),
      cita({ estado: "pendiente", activo: true }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });
});

describe("decidirAviso — recordatorio", () => {
  it("envía el recordatorio cuando la cita sigue vigente", () => {
    expect(decidirAviso(aviso(), cita(), PARAMS)).toEqual({ accion: "enviar" });
  });

  it("reprograma cuando la cita se movió a un horario futuro", () => {
    const nuevaFecha = new Date("2026-10-05T18:00:00Z");
    const decision = decidirAviso(
      aviso(),
      cita({ fechaHora: nuevaFecha, version: 2 }),
      PARAMS,
    );
    expect(decision.accion).toBe("reprogramar");
    if (decision.accion === "reprogramar") {
      expect(decision.programadoPara).toEqual(instanteRecordatorio(nuevaFecha, 24));
      expect(decision.versionCita).toBe(2);
      expect(decision.fechaHoraSnapshot).toEqual(nuevaFecha);
    }
  });

  it("omite cuando la cita reagendada es inminente", () => {
    const decision = decidirAviso(
      aviso(),
      cita({ fechaHora: new Date("2026-10-01T15:20:00Z"), version: 2 }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });

  it("omite cuando la cita ya ocurrió", () => {
    const decision = decidirAviso(
      aviso(),
      cita({ fechaHora: new Date("2026-09-30T10:00:00Z") }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });

  it("omite en estados no recordables", () => {
    const decision = decidirAviso(aviso(), cita({ estado: "en_proceso" }), PARAMS);
    expect(decision.accion).toBe("omitir");
  });
});

describe("decidirAviso — confirmación, cambio y solicitud", () => {
  it("envía confirmación cuando la versión coincide", () => {
    expect(decidirAviso(aviso({ tipo: TIPO_CONFIRMACION }), cita(), PARAMS)).toEqual({ accion: "enviar" });
  });

  it("omite confirmación cuando hubo un cambio posterior", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CONFIRMACION }),
      cita({ version: 2 }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });

  it("omite un cambio cuando hay uno más reciente", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_CAMBIO }),
      cita({ version: 3 }),
      PARAMS,
    );
    expect(decision.accion).toBe("omitir");
  });

  it("envía solicitud mientras la reserva sigue pendiente", () => {
    const decision = decidirAviso(
      aviso({ tipo: TIPO_SOLICITUD }),
      cita({ estado: "pendiente" }),
      PARAMS,
    );
    expect(decision).toEqual({ accion: "enviar" });
  });

  it("omite solicitud cuando el negocio ya decidió", () => {
    for (const estado of ["confirmada", "cancelada"]) {
      const decision = decidirAviso(
        aviso({ tipo: TIPO_SOLICITUD }),
        cita({ estado }),
        PARAMS,
      );
      expect(decision.accion).toBe("omitir");
    }
  });
});

describe("entraEnVentanaRecordatorio", () => {
  it("incluye citas cuyo instante de recordatorio cae en la ventana del cron", () => {
    // instante = fechaHora - 24h = AHORA - 10min → dentro de [ahora-30m, ahora+30m)
    expect(
      entraEnVentanaRecordatorio(
        cita({ fechaHora: new Date("2026-10-02T14:50:00Z") }),
        PARAMS,
      ),
    ).toBe(true);
  });

  it("excluye citas fuera de la ventana o sin correo", () => {
    expect(
      entraEnVentanaRecordatorio(
        cita({ fechaHora: new Date("2026-10-04T15:00:00Z") }), // instante en +48h
        PARAMS,
      ),
    ).toBe(false);
    expect(
      entraEnVentanaRecordatorio(
        cita({ correoCliente: null, fechaHora: new Date("2026-10-02T14:50:00Z") }),
        PARAMS,
      ),
    ).toBe(false);
  });

  it("excluye citas pasadas o en estados no recordables", () => {
    expect(
      entraEnVentanaRecordatorio(
        cita({ fechaHora: new Date("2026-09-30T10:00:00Z") }),
        PARAMS,
      ),
    ).toBe(false);
    expect(
      entraEnVentanaRecordatorio(
        cita({ estado: "cancelada", fechaHora: new Date("2026-10-02T14:50:00Z") }),
        PARAMS,
      ),
    ).toBe(false);
  });
});
