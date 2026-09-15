import { describe, expect, it } from "vitest";

import { sugerirHorariosLibres } from "./sugerencias";
import { localDateTimeToUtc } from "./timezone";
import type { BloqueoLike, CitaLike, RecursoLike, TurnoDia } from "./rules";

const TZ = "America/Mexico_City";
const LUNES = "2025-01-06"; // lunes en la zona local

function enPunto(dayKey: string, hhmm: string): Date {
  const fecha = localDateTimeToUtc(`${dayKey}T${hhmm}`, TZ);
  if (!fecha) throw new Error(`fecha inválida ${dayKey} ${hhmm}`);
  return fecha;
}

function citaLocal(id: string, usuarioId: string | null, dayKey: string, inicio: string, fin: string): CitaLike {
  return {
    id,
    usuarioId,
    estado: "pendiente",
    activo: true,
    iniciaAtMs: enPunto(dayKey, inicio).getTime(),
    terminaAtMs: enPunto(dayKey, fin).getTime(),
  };
}

function bloqueoLocal(usuarioId: string | null, dayKey: string, inicio: string, fin: string): BloqueoLike {
  return {
    usuarioId,
    activo: true,
    iniciaAtMs: enPunto(dayKey, inicio).getTime(),
    terminaAtMs: enPunto(dayKey, fin).getTime(),
  };
}

const turnoSemana: TurnoDia[] = [
  { diaSemana: 1, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  { diaSemana: 2, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  { diaSemana: 3, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  { diaSemana: 4, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  { diaSemana: 5, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  { diaSemana: 6, iniciaMinutos: 9 * 60, terminaMinutos: 18 * 60, activo: true },
  // domingo cerrado
];

function buscar(params: {
  desde: Date;
  duracion?: number;
  usuarioId?: string | null;
  citas?: CitaLike[];
  bloqueos?: BloqueoLike[];
  capacidad?: number;
  recursoIds?: string[];
  recursos?: RecursoLike[];
}) {
  return sugerirHorariosLibres({
    desde: params.desde,
    duracionMinutos: params.duracion ?? 60,
    // null explícito = carril "sin asignar"; undefined = profesional por defecto.
    usuarioId: params.usuarioId === undefined ? "u1" : params.usuarioId,
    recursoIds: params.recursoIds,
    ocupacion: {
      horarios: turnoSemana,
      bloqueos: params.bloqueos ?? [],
      citas: params.citas ?? [],
      recursos: params.recursos,
    },
    zonaHoraria: TZ,
    capacidadSinAsignar: params.capacidad,
  });
}

describe("sugerirHorariosLibres", () => {
  it("salta una cita ocupada y sugiere el siguiente hueco", () => {
    const citas = [citaLocal("a", "u1", LUNES, "10:00", "11:00")];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), citas });
    expect(libres[0]).toEqual(enPunto(LUNES, "11:00"));
  });

  it("no sugiere dentro de un bloqueo activo del profesional", () => {
    const bloqueos = [bloqueoLocal("u1", LUNES, "10:00", "12:00")];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), bloqueos });
    expect(libres[0]).toEqual(enPunto(LUNES, "12:00"));
  });

  it("el bloqueo de otro profesional no limita al candidato", () => {
    const bloqueos = [bloqueoLocal("u2", LUNES, "10:00", "12:00")];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), bloqueos });
    expect(libres[0]).toEqual(enPunto(LUNES, "10:00"));
  });

  it("el bloqueo general de sucursal aplica a todos", () => {
    const bloqueos = [bloqueoLocal(null, LUNES, "10:00", "11:00")];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), bloqueos });
    expect(libres[0]).toEqual(enPunto(LUNES, "11:00"));
  });

  it("omite días sin turno y sigue al siguiente día hábil", () => {
    // Domingo 2025-01-05 no tiene turno configurado.
    const libres = buscar({ desde: enPunto("2025-01-05", "10:00") });
    expect(libres[0]).toEqual(enPunto(LUNES, "09:00"));
  });

  it("respeta la duración: una cita de 2h no cabe al final del turno", () => {
    const libres = buscar({ desde: enPunto(LUNES, "17:30"), duracion: 120 });
    // 17:30+120 = 19:30 > 18:00; siguiente hueco válido es martes 09:00.
    expect(libres[0]).toEqual(enPunto("2025-01-07", "09:00"));
  });

  it("con capacidad 2, el carril sin asignar admite el segundo traslape", () => {
    const citas = [citaLocal("a", null, LUNES, "10:00", "11:00")];
    const libres = buscar({ desde: enPunto(LUNES, "10:30"), usuarioId: null, citas, capacidad: 2 });
    expect(libres[0]).toEqual(enPunto(LUNES, "10:30"));
  });

  it("con capacidad 2 agotada, sugiere después de que se libera un lugar", () => {
    const citas = [
      citaLocal("a", null, LUNES, "10:00", "11:00"),
      citaLocal("b", null, LUNES, "10:30", "11:30"),
    ];
    const libres = buscar({ desde: enPunto(LUNES, "10:30"), usuarioId: null, citas, capacidad: 2 });
    // 11:00: queda 1 lugar libre (a terminó, b sigue hasta 11:30).
    expect(libres[0]).toEqual(enPunto(LUNES, "11:00"));
  });

  it("salta el horario donde el recurso pedido está ocupado", () => {
    const recursos: RecursoLike[] = [{ id: "r1", nombre: "Cabina 1", capacidad: 1 }];
    // La cita "a" (otro profesional) ocupa la cabina de 10 a 11.
    const citas: CitaLike[] = [{ ...citaLocal("a", "u2", LUNES, "10:00", "11:00"), recursoIds: ["r1"] }];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), citas, recursos, recursoIds: ["r1"] });
    expect(libres[0]).toEqual(enPunto(LUNES, "11:00"));
  });

  it("recurso con capacidad 2 admite sugerir en horario con una sola reserva", () => {
    const recursos: RecursoLike[] = [{ id: "r2", nombre: "Sillas", capacidad: 2 }];
    const citas: CitaLike[] = [{ ...citaLocal("a", "u2", LUNES, "10:00", "11:00"), recursoIds: ["r2"] }];
    const libres = buscar({ desde: enPunto(LUNES, "10:00"), citas, recursos, recursoIds: ["r2"] });
    expect(libres[0]).toEqual(enPunto(LUNES, "10:00"));
  });

  it("devuelve [] cuando no hay horarios configurados", () => {
    const libres = sugerirHorariosLibres({
      desde: enPunto(LUNES, "10:00"),
      duracionMinutos: 60,
      usuarioId: "u1",
      ocupacion: { horarios: [], bloqueos: [], citas: [] },
      zonaHoraria: TZ,
    });
    expect(libres).toEqual([]);
  });
});
