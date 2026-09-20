import { describe, expect, it } from "vitest";

import {
  dentroDeVentanaReserva,
  normalizarContacto,
  puedeGestionarCita,
  rateLimitExcedido,
  slotsDisponiblesDia,
  validarDatosReserva,
} from "./rules";
import { generarTokenGestion, hashTokenGestion } from "./gestion";

const TZ = "America/Mexico_City";

const turno = { diaSemana: 3, iniciaMinutos: 9 * 60, terminaMinutos: 14 * 60, activo: true }; // miércoles 09:00–14:00

const ocupacionBase = { horarios: [turno], bloqueos: [], citas: [] };

describe("slotsDisponiblesDia", () => {
  it("genera slots cada paso dentro del turno", () => {
    // 2026-02-04 es miércoles.
    const slots = slotsDisponiblesDia({
      diaKey: "2026-02-04",
      duracionMinutos: 60,
      ocupacion: ocupacionBase,
      zonaHoraria: TZ,
      ahora: new Date("2026-02-03T00:00:00Z"),
      pasoMinutos: 60,
    });
    expect(slots.length).toBe(5); // 09:00, 10:00, 11:00, 12:00, 13:00
  });

  it("omite slots ya pasados", () => {
    const slots = slotsDisponiblesDia({
      diaKey: "2026-02-04",
      duracionMinutos: 60,
      ocupacion: ocupacionBase,
      zonaHoraria: TZ,
      // 11:30 local → solo quedan 12:00 y 13:00
      ahora: new Date("2026-02-04T17:30:00Z"),
      pasoMinutos: 60,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-02-04T18:00:00.000Z",
      "2026-02-04T19:00:00.000Z",
    ]);
  });

  it("respeta traslapes del carril sin asignar según capacidad", () => {
    // Cita 09:00–10:00 sin profesional: con capacidad 1 bloquea ese slot.
    const citas = [
      {
        id: "c1",
        usuarioId: null,
        iniciaAtMs: new Date("2026-02-04T15:00:00Z").getTime(),
        terminaAtMs: new Date("2026-02-04T16:00:00Z").getTime(),
        estado: "pendiente",
        activo: true,
        recursoIds: [],
      },
    ];
    const conCap1 = slotsDisponiblesDia({
      diaKey: "2026-02-04",
      duracionMinutos: 60,
      ocupacion: { ...ocupacionBase, citas },
      zonaHoraria: TZ,
      capacidadSinAsignar: 1,
      ahora: new Date("2026-02-03T00:00:00Z"),
      pasoMinutos: 60,
    });
    expect(conCap1.map((s) => s.toISOString())).not.toContain("2026-02-04T15:00:00.000Z");

    const conCap2 = slotsDisponiblesDia({
      diaKey: "2026-02-04",
      duracionMinutos: 60,
      ocupacion: { ...ocupacionBase, citas },
      zonaHoraria: TZ,
      capacidadSinAsignar: 2,
      ahora: new Date("2026-02-03T00:00:00Z"),
      pasoMinutos: 60,
    });
    expect(conCap2.map((s) => s.toISOString())).toContain("2026-02-04T15:00:00.000Z");
  });

  it("sin turno ese día o duración inválida devuelve vacío", () => {
    expect(
      slotsDisponiblesDia({
        diaKey: "2026-02-05", // jueves, sin turno
        duracionMinutos: 60,
        ocupacion: ocupacionBase,
        zonaHoraria: TZ,
      }),
    ).toEqual([]);
    expect(
      slotsDisponiblesDia({
        diaKey: "2026-02-04",
        duracionMinutos: 0,
        ocupacion: ocupacionBase,
        zonaHoraria: TZ,
      }),
    ).toEqual([]);
  });
});

describe("validarDatosReserva", () => {
  const base = { nombre: "María López", telefono: "55 1234 5678" };

  it("acepta datos completos válidos", () => {
    expect(validarDatosReserva({ ...base, correo: "maria@correo.com" }).ok).toBe(true);
    expect(validarDatosReserva(base).ok).toBe(true);
  });

  it("rechaza nombre corto o teléfono inválido", () => {
    expect(validarDatosReserva({ ...base, nombre: "M" }).ok).toBe(false);
    expect(validarDatosReserva({ ...base, telefono: "12" }).ok).toBe(false);
  });

  it("rechaza correo malformado pero permite vacío", () => {
    expect(validarDatosReserva({ ...base, correo: "no-es-correo" }).ok).toBe(false);
    expect(validarDatosReserva({ ...base, correo: "" }).ok).toBe(true);
  });
});

describe("normalizarContacto", () => {
  it("normaliza como el alta interna de clientes", () => {
    expect(normalizarContacto(" 55 1234 5678 ")).toBe("5512345678");
    expect(normalizarContacto(" Maria@Correo.COM ")).toBe("maria@correo.com");
    expect(normalizarContacto("  ")).toBeNull();
    expect(normalizarContacto(undefined)).toBeNull();
  });
});

describe("dentroDeVentanaReserva", () => {
  const politica = { cancelacionHoras: 24, anticipacionMinutos: 120, horizonteDias: 14 };
  const ahora = new Date("2026-03-01T18:00:00Z");

  it("acepta un horario dentro de la ventana", () => {
    const fecha = new Date(ahora.getTime() + 3 * 24 * 60 * 60_000);
    expect(dentroDeVentanaReserva(fecha, politica, ahora).ok).toBe(true);
  });

  it("rechaza horarios dentro de la anticipación mínima", () => {
    const fecha = new Date(ahora.getTime() + 60 * 60_000); // 1 h < 2 h mínimas
    const res = dentroDeVentanaReserva(fecha, politica, ahora);
    expect(res.ok).toBe(false);
  });

  it("rechaza fechas más allá del horizonte", () => {
    const fecha = new Date(ahora.getTime() + 20 * 24 * 60 * 60_000);
    expect(dentroDeVentanaReserva(fecha, politica, ahora).ok).toBe(false);
  });

  it("acepta el límite exacto del horizonte", () => {
    const fecha = new Date(ahora.getTime() + politica.horizonteDias * 24 * 60 * 60_000);
    expect(dentroDeVentanaReserva(fecha, politica, ahora).ok).toBe(true);
  });
});

describe("puedeGestionarCita", () => {
  const ahora = new Date("2026-03-01T18:00:00Z");
  const politica = { cancelacionHoras: 24 };

  it("permite gestionar una cita confirmada fuera del corte", () => {
    const cita = { fechaHora: new Date(ahora.getTime() + 48 * 60 * 60_000), estado: "confirmada", activo: true };
    expect(puedeGestionarCita(cita, politica, ahora).puede).toBe(true);
  });

  it("rechaza dentro del plazo de corte", () => {
    const cita = { fechaHora: new Date(ahora.getTime() + 12 * 60 * 60_000), estado: "confirmada", activo: true };
    const res = puedeGestionarCita(cita, politica, ahora);
    expect(res.puede).toBe(false);
    if (!res.puede) expect(res.motivo).toContain("24 h");
  });

  it("rechaza citas canceladas o completadas", () => {
    const base = { fechaHora: new Date(ahora.getTime() + 48 * 60 * 60_000), activo: true };
    expect(puedeGestionarCita({ ...base, estado: "cancelada" }, politica, ahora).puede).toBe(false);
    expect(puedeGestionarCita({ ...base, estado: "completada" }, politica, ahora).puede).toBe(false);
  });

  it("rechaza citas inactivas", () => {
    const cita = { fechaHora: new Date(ahora.getTime() + 48 * 60 * 60_000), estado: "confirmada", activo: false };
    expect(puedeGestionarCita(cita, politica, ahora).puede).toBe(false);
  });
});

describe("rateLimitExcedido", () => {
  const ahora = new Date("2026-03-01T18:00:00Z");
  const limite = { limite: 3, ventanaMs: 60 * 60_000 };

  it("no excede con menos eventos que el límite", () => {
    const eventos = [new Date(ahora.getTime() - 10_000), new Date(ahora.getTime() - 20_000)];
    expect(rateLimitExcedido(eventos, limite, ahora)).toBe(false);
  });

  it("excede al alcanzar el límite dentro de la ventana", () => {
    const eventos = [1, 2, 3].map((i) => new Date(ahora.getTime() - i * 1000));
    expect(rateLimitExcedido(eventos, limite, ahora)).toBe(true);
  });

  it("ignora eventos fuera de la ventana", () => {
    const eventos = [1, 2, 3].map((i) => new Date(ahora.getTime() - (limite.ventanaMs + i * 1000)));
    expect(rateLimitExcedido(eventos, limite, ahora)).toBe(false);
  });
});

describe("tokens de gestión", () => {
  it("el hash es sha256 hex de 64 caracteres y determinista", () => {
    const hash = hashTokenGestion("token-de-prueba");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTokenGestion("token-de-prueba")).toBe(hash);
    expect(hashTokenGestion("otro")).not.toBe(hash);
  });

  it("genera tokens únicos de 64 caracteres hex", () => {
    const a = generarTokenGestion();
    const b = generarTokenGestion();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
