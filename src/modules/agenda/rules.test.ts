import { describe, expect, it } from "vitest";

import {
  canRescheduleEstado,
  canTransitionEstado,
  detectOverlap,
  intervalsOverlap,
  isCitaEditable,
  validateBlocks,
  validateBusinessHours,
  validateCitaAvailability,
  validateCitaOverlaps,
  validateRecursos,
  type BloqueoLike,
  type CitaLike,
  type RecursoLike,
  type TurnoDia,
} from "./rules";

const MIN = 60_000;

function rango(horaInicio: number, horaFin: number) {
  const base = Date.UTC(2025, 0, 6); // lunes
  return { iniciaAtMs: base + horaInicio * 60 * MIN, terminaAtMs: base + horaFin * 60 * MIN };
}

const turnoCompleto: TurnoDia[] = [{ diaSemana: 1, iniciaMinutos: 8 * 60, terminaMinutos: 21 * 60, activo: true }];

const dosTurnos: TurnoDia[] = [
  { diaSemana: 1, iniciaMinutos: 8 * 60, terminaMinutos: 13 * 60, activo: true },
  { diaSemana: 1, iniciaMinutos: 15 * 60, terminaMinutos: 21 * 60, activo: true },
];

function cita(id: string, usuarioId: string | null, horaInicio: number, horaFin: number, estado = "pendiente"): CitaLike {
  return { id, usuarioId, estado, activo: true, ...rango(horaInicio, horaFin) };
}

describe("intervalsOverlap / detectOverlap", () => {
  it("detecta traslapes parciales y contenidos", () => {
    expect(intervalsOverlap(rango(9, 10), rango(9.5, 10.5))).toBe(true);
    expect(intervalsOverlap(rango(9, 11), rango(9.5, 10))).toBe(true);
    expect(intervalsOverlap(rango(9.5, 10), rango(9, 11))).toBe(true);
  });

  it("intervalos adyacentes no se traslapan (semiabiertos)", () => {
    expect(intervalsOverlap(rango(9, 10), rango(10, 11))).toBe(false);
    expect(intervalsOverlap(rango(10, 11), rango(9, 10))).toBe(false);
  });

  it("detectOverlap filtra solo los conflictivos", () => {
    const otros = [cita("a", "u1", 9, 10), cita("b", "u1", 11, 12)];
    expect(detectOverlap(rango(9.5, 10.5), otros).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("validateBusinessHours", () => {
  it("acepta una cita dentro del turno", () => {
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 10 * 60, duracionMinutos: 60, horarios: turnoCompleto })).toEqual([]);
  });

  it("rechaza sin horario configurado ese día", () => {
    const v = validateBusinessHours({ diaSemana: 0, iniciaMinutosLocal: 10 * 60, duracionMinutos: 60, horarios: turnoCompleto });
    expect(v[0]?.codigo).toBe("sin_horario");
  });

  it("rechaza fuera de rango y cita que excede el cierre", () => {
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 7 * 60, duracionMinutos: 60, horarios: turnoCompleto })[0]?.codigo).toBe("fuera_horario");
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 20 * 60 + 30, duracionMinutos: 60, horarios: turnoCompleto })[0]?.codigo).toBe("fuera_horario");
  });

  it("rechaza citas que cruzan medianoche local", () => {
    const v = validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 23 * 60, duracionMinutos: 120, horarios: turnoCompleto });
    expect(v[0]?.codigo).toBe("fuera_horario");
  });

  it("acepta límites exactos de minutos (inicio en apertura, fin en cierre)", () => {
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 8 * 60, duracionMinutos: 13 * 60, horarios: turnoCompleto })).toEqual([]);
  });

  it("con varios turnos acepta cualquiera y rechaza el hueco entre turnos", () => {
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 16 * 60, duracionMinutos: 60, horarios: dosTurnos })).toEqual([]);
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 12 * 60 + 30, duracionMinutos: 120, horarios: dosTurnos })[0]?.codigo).toBe("fuera_horario");
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 12 * 60 + 30, duracionMinutos: 30, horarios: dosTurnos })).toEqual([]);
  });

  it("ignora turnos inactivos", () => {
    const horarios: TurnoDia[] = [{ diaSemana: 1, iniciaMinutos: 8 * 60, terminaMinutos: 21 * 60, activo: false }];
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 10 * 60, duracionMinutos: 60, horarios })[0]?.codigo).toBe("sin_horario");
  });

  it("rechaza duraciones inválidas", () => {
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 10 * 60, duracionMinutos: 0, horarios: turnoCompleto })[0]?.codigo).toBe("duracion_invalida");
    expect(validateBusinessHours({ diaSemana: 1, iniciaMinutosLocal: 10 * 60, duracionMinutos: 1441, horarios: turnoCompleto })[0]?.codigo).toBe("duracion_invalida");
  });
});

describe("validateBlocks", () => {
  const bloqueoGeneral: BloqueoLike = { id: "b1", usuarioId: null, tipo: "cierre", activo: true, ...rango(12, 14) };
  const bloqueoPro: BloqueoLike = { id: "b2", usuarioId: "u1", tipo: "descanso", activo: true, ...rango(12, 14) };

  it("bloqueo general aplica a cualquier profesional y a sin-asignar", () => {
    expect(validateBlocks({ candidato: { ...rango(13, 15), usuarioId: "u9" }, bloqueos: [bloqueoGeneral] })).toHaveLength(1);
    expect(validateBlocks({ candidato: { ...rango(13, 15), usuarioId: null }, bloqueos: [bloqueoGeneral] })).toHaveLength(1);
  });

  it("bloqueo por profesional solo aplica a ese profesional", () => {
    expect(validateBlocks({ candidato: { ...rango(13, 15), usuarioId: "u1" }, bloqueos: [bloqueoPro] })).toHaveLength(1);
    expect(validateBlocks({ candidato: { ...rango(13, 15), usuarioId: "u2" }, bloqueos: [bloqueoPro] })).toHaveLength(0);
  });

  it("ignora bloqueos inactivos o que no se traslapan", () => {
    expect(validateBlocks({ candidato: { ...rango(13, 15), usuarioId: "u1" }, bloqueos: [{ ...bloqueoPro, activo: false }] })).toHaveLength(0);
    expect(validateBlocks({ candidato: { ...rango(14, 15), usuarioId: "u1" }, bloqueos: [bloqueoGeneral] })).toHaveLength(0);
  });
});

describe("validateCitaOverlaps", () => {
  it("mismo profesional traslapa; distinto profesional no", () => {
    const citas = [cita("x", "u1", 9, 10)];
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u1" }, citas })).toHaveLength(1);
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u2" }, citas })).toHaveLength(0);
  });

  it("citas sin asignar compiten entre sí", () => {
    const citas = [cita("x", null, 9, 10)];
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: null }, citas })).toHaveLength(1);
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u1" }, citas })).toHaveLength(0);
  });

  it("ignora la propia cita al editar (ignoreCitaId)", () => {
    const citas = [cita("x", "u1", 9, 10)];
    expect(validateCitaOverlaps({ candidato: { ...rango(9, 10), usuarioId: "u1" }, citas, ignoreCitaId: "x" })).toHaveLength(0);
  });

  it.each(["cancelada", "no_asistio", "completada"])("ignora citas en estado %s", (estado) => {
    const citas = [cita("x", "u1", 9, 10, estado)];
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u1" }, citas })).toHaveLength(0);
  });

  it("estados vivos sí bloquean", () => {
    for (const estado of ["pendiente", "confirmada", "en_proceso"]) {
      const citas = [cita("x", "u1", 9, 10, estado)];
      expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u1" }, citas })).toHaveLength(1);
    }
  });

  it("ignora citas inactivas", () => {
    const citas = [{ ...cita("x", "u1", 9, 10), activo: false }];
    expect(validateCitaOverlaps({ candidato: { ...rango(9.5, 10.5), usuarioId: "u1" }, citas })).toHaveLength(0);
  });

  it("capacidad 2 permite una segunda cita sin asignar pero no la tercera", () => {
    const citas = [cita("x", null, 9, 10)];
    expect(
      validateCitaOverlaps({
        candidato: { ...rango(9.5, 10.5), usuarioId: null },
        citas,
        capacidadSinAsignar: 2,
      }),
    ).toHaveLength(0);

    const dosOcupadas = [cita("x", null, 9, 10), cita("y", null, 9.5, 10.5)];
    const violaciones = validateCitaOverlaps({
      candidato: { ...rango(9.5, 10.5), usuarioId: null },
      citas: dosOcupadas,
      capacidadSinAsignar: 2,
    });
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]?.mensaje).toContain("2 citas simultáneas");
  });

  it("capacidad no afecta al carril de un profesional (siempre 1)", () => {
    const citas = [cita("x", "u1", 9, 10)];
    expect(
      validateCitaOverlaps({
        candidato: { ...rango(9.5, 10.5), usuarioId: "u1" },
        citas,
        capacidadSinAsignar: 5,
      }),
    ).toHaveLength(1);
  });
});

describe("validateRecursos", () => {
  const cabina: RecursoLike = { id: "r1", nombre: "Cabina 1", capacidad: 1 };
  const sillas: RecursoLike = { id: "r2", nombre: "Sillas manicura", capacidad: 2 };

  const citaConRecurso = (id: string, recursoId: string, ini: number, fin: number, estado = "pendiente"): CitaLike => ({
    ...cita(id, "u1", ini, fin, estado),
    recursoIds: [recursoId],
  });

  it("rechaza cuando el recurso ya está ocupado en ese horario", () => {
    const v = validateRecursos({
      recursoIds: ["r1"],
      recursos: [cabina],
      citas: [citaConRecurso("x", "r1", 9, 10)],
      candidato: rango(9.5, 10.5),
    });
    expect(v).toHaveLength(1);
    expect(v[0]?.codigo).toBe("recurso");
    expect(v[0]?.conflictoId).toBe("r1");
  });

  it("acepta si la otra cita no se traslapa o no usa el recurso", () => {
    expect(
      validateRecursos({
        recursoIds: ["r1"],
        recursos: [cabina],
        citas: [citaConRecurso("x", "r1", 10, 11)],
        candidato: rango(9, 10),
      }),
    ).toHaveLength(0);
    expect(
      validateRecursos({
        recursoIds: ["r1"],
        recursos: [cabina],
        citas: [cita("x", "u1", 9, 10)],
        candidato: rango(9, 10),
      }),
    ).toHaveLength(0);
  });

  it("capacidad 2 permite la segunda reserva pero no la tercera", () => {
    const una = [citaConRecurso("x", "r2", 9, 10)];
    expect(
      validateRecursos({ recursoIds: ["r2"], recursos: [sillas], citas: una, candidato: rango(9, 10) }),
    ).toHaveLength(0);
    const dos = [...una, citaConRecurso("y", "r2", 9.5, 10.5)];
    expect(
      validateRecursos({ recursoIds: ["r2"], recursos: [sillas], citas: dos, candidato: rango(9.5, 10) }),
    ).toHaveLength(1);
  });

  it("ignora citas inactivas, terminales y la propia (ignoreCitaId)", () => {
    const base = { recursoIds: ["r1"], recursos: [cabina], candidato: rango(9, 10) };
    expect(validateRecursos({ ...base, citas: [{ ...citaConRecurso("x", "r1", 9, 10), activo: false }] })).toHaveLength(0);
    expect(validateRecursos({ ...base, citas: [citaConRecurso("x", "r1", 9, 10, "cancelada")] })).toHaveLength(0);
    expect(validateRecursos({ ...base, citas: [citaConRecurso("x", "r1", 9, 10)], ignoreCitaId: "x" })).toHaveLength(0);
  });

  it("ignora recursos desconocidos y valida cada uno por separado", () => {
    expect(
      validateRecursos({ recursoIds: ["fantasma"], recursos: [cabina], citas: [], candidato: rango(9, 10) }),
    ).toHaveLength(0);
    const v = validateRecursos({
      recursoIds: ["r1", "r2"],
      recursos: [cabina, sillas],
      citas: [citaConRecurso("x", "r1", 9, 10)],
      candidato: rango(9, 10),
    });
    expect(v).toHaveLength(1);
    expect(v[0]?.conflictoId).toBe("r1");
  });
});

describe("validateCitaAvailability", () => {
  const base = {
    diaSemana: 1,
    iniciaMinutosLocal: 10 * 60,
    duracionMinutos: 60,
    horarios: turnoCompleto,
    bloqueos: [] as BloqueoLike[],
    citas: [] as CitaLike[],
  };

  it("ok cuando no hay conflictos", () => {
    const r = validateCitaAvailability({ ...base, candidato: { ...rango(10, 11), usuarioId: "u1" } });
    expect(r.ok).toBe(true);
    expect(r.violaciones).toEqual([]);
  });

  it("acumula violaciones de horario, bloqueo y traslape", () => {
    const r = validateCitaAvailability({
      ...base,
      iniciaMinutosLocal: 7 * 60,
      duracionMinutos: 240,
      candidato: { ...rango(7, 11), usuarioId: "u1" },
      bloqueos: [{ id: "b", usuarioId: null, activo: true, ...rango(8, 9) }],
      citas: [cita("c", "u1", 9, 10)],
    });
    expect(r.ok).toBe(false);
    expect(r.violaciones.map((v) => v.codigo)).toEqual(["fuera_horario", "bloqueo", "traslape"]);
  });

  it("combina profesional + recurso: ambos deben estar libres", () => {
    const recursos: RecursoLike[] = [{ id: "r1", nombre: "Cabina 1", capacidad: 1 }];
    const ocupada: CitaLike = { ...cita("x", "u2", 10, 11), recursoIds: ["r1"] };
    // Profesional libre pero cabina ocupada.
    const r1 = validateCitaAvailability({
      ...base,
      candidato: { ...rango(10, 11), usuarioId: "u1" },
      citas: [ocupada],
      recursoIds: ["r1"],
      recursos,
    });
    expect(r1.ok).toBe(false);
    expect(r1.violaciones[0]?.codigo).toBe("recurso");
    // Profesional ocupado aunque la cabina esté libre.
    const r2 = validateCitaAvailability({
      ...base,
      candidato: { ...rango(10, 11), usuarioId: "u2" },
      citas: [ocupada],
      recursoIds: [],
      recursos,
    });
    expect(r2.violaciones[0]?.codigo).toBe("traslape");
    // Ambos libres en otro horario.
    const r3 = validateCitaAvailability({
      ...base,
      iniciaMinutosLocal: 11 * 60,
      candidato: { ...rango(11, 12), usuarioId: "u1" },
      citas: [ocupada],
      recursoIds: ["r1"],
      recursos,
    });
    expect(r3.ok).toBe(true);
  });
});

describe("canTransitionEstado", () => {
  it.each([
    ["pendiente", "confirmada", true],
    ["pendiente", "en_proceso", true],
    ["pendiente", "cancelada", true],
    ["pendiente", "completada", false],
    ["confirmada", "en_proceso", true],
    ["confirmada", "no_asistio", true],
    ["confirmada", "completada", true],
    ["en_proceso", "completada", true],
    ["en_proceso", "pendiente", false],
    ["completada", "pendiente", false],
    ["completada", "cancelada", false],
    ["cancelada", "pendiente", true],
    ["no_asistio", "pendiente", true],
    ["cancelada", "confirmada", false],
    ["pendiente", "pendiente", false],
    ["desconocido", "pendiente", false],
    ["pendiente", "desconocido", false],
  ])("%s -> %s = %s", (from, to, expected) => {
    expect(canTransitionEstado(from, to)).toBe(expected);
  });
});

describe("isCitaEditable / canRescheduleEstado", () => {
  it("citas en estados terminales no son editables", () => {
    expect(isCitaEditable("pendiente")).toBe(true);
    expect(isCitaEditable("confirmada")).toBe(true);
    expect(isCitaEditable("en_proceso")).toBe(true);
    expect(isCitaEditable("cancelada")).toBe(false);
    expect(isCitaEditable("no_asistio")).toBe(false);
    expect(isCitaEditable("completada")).toBe(false);
  });

  it("reagendar permite rescatar cancelada/no_asistio pero no completada/en_proceso", () => {
    expect(canRescheduleEstado("cancelada")).toBe(true);
    expect(canRescheduleEstado("no_asistio")).toBe(true);
    expect(canRescheduleEstado("pendiente")).toBe(true);
    expect(canRescheduleEstado("confirmada")).toBe(true);
    expect(canRescheduleEstado("en_proceso")).toBe(false);
    expect(canRescheduleEstado("completada")).toBe(false);
  });
});
