import { describe, expect, it } from "vitest";

import {
  dayBoundsUtc,
  dayKey,
  getZonedParts,
  isValidTimeZone,
  localDateTimeToUtc,
  parseFechaHoraInput,
  resolveTimeZone,
  shiftDateKey,
  timeZoneOffsetMs,
  weekStartDateKey,
} from "./timezone";

const MX = "America/Mexico_City"; // UTC-6 fijo (sin DST desde 2022)
const NY = "America/New_York"; // EST UTC-5 / EDT UTC-4

describe("getZonedParts / dayKey", () => {
  it("descompone un instante UTC en hora de muro", () => {
    const parts = getZonedParts(new Date("2025-01-15T15:30:00Z"), MX);
    expect(parts.dayKey).toBe("2025-01-15");
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(30);
    expect(parts.diaSemana).toBe(3); // miércoles
    expect(parts.minutosDelDia).toBe(9 * 60 + 30);
  });

  it("alrededor de medianoche el día local difiere del día UTC", () => {
    // 2025-01-15T05:30Z = 2025-01-14 23:30 en Ciudad de México.
    const instante = new Date("2025-01-15T05:30:00Z");
    expect(dayKey(instante, MX)).toBe("2025-01-14");
    expect(dayKey(instante, "UTC")).toBe("2025-01-15");
    expect(getZonedParts(instante, MX).minutosDelDia).toBe(23 * 60 + 30);
  });

  it("domingo = 0", () => {
    // 2025-01-12 es domingo.
    expect(getZonedParts(new Date("2025-01-12T12:00:00Z"), MX).diaSemana).toBe(0);
  });
});

describe("timeZoneOffsetMs", () => {
  it("refleja offsets distintos por zona", () => {
    expect(timeZoneOffsetMs(new Date("2025-01-15T12:00:00Z"), MX)).toBe(-6 * 3600_000);
    expect(timeZoneOffsetMs(new Date("2025-01-15T12:00:00Z"), "UTC")).toBe(0);
  });

  it("recalcula el offset en transiciones DST (Nueva York)", () => {
    expect(timeZoneOffsetMs(new Date("2025-01-15T12:00:00Z"), NY)).toBe(-5 * 3600_000);
    expect(timeZoneOffsetMs(new Date("2025-07-15T12:00:00Z"), NY)).toBe(-4 * 3600_000);
  });
});

describe("localDateTimeToUtc", () => {
  it("convierte datetime-local a UTC en zona fija", () => {
    expect(localDateTimeToUtc("2025-01-15T09:30", MX)?.toISOString()).toBe("2025-01-15T15:30:00.000Z");
    expect(localDateTimeToUtc("2025-01-15T00:00", MX)?.toISOString()).toBe("2025-01-15T06:00:00.000Z");
    expect(localDateTimeToUtc("2025-01-15T23:59", MX)?.toISOString()).toBe("2025-01-16T05:59:00.000Z");
  });

  it("usa el offset correcto a cada lado del cambio DST", () => {
    // Antes del spring-forward (EST, UTC-5).
    expect(localDateTimeToUtc("2024-03-10T01:30", NY)?.toISOString()).toBe("2024-03-10T06:30:00.000Z");
    // Después del spring-forward (EDT, UTC-4).
    expect(localDateTimeToUtc("2024-03-10T04:30", NY)?.toISOString()).toBe("2024-03-10T08:30:00.000Z");
    // En verano pleno.
    expect(localDateTimeToUtc("2024-07-10T12:00", NY)?.toISOString()).toBe("2024-07-10T16:00:00.000Z");
  });

  it("hora de muro inexistente (gap DST) cae hacia adelante", () => {
    // 2024-03-10 02:30 no existe en NY: 02:00 salta a 03:00.
    const result = localDateTimeToUtc("2024-03-10T02:30", NY);
    expect(result?.toISOString()).toBe("2024-03-10T07:30:00.000Z"); // 03:30 EDT
  });

  it("hora ambigua en fall-back elige la primera ocurrencia", () => {
    // 2024-11-03 01:30 ocurre dos veces (EDT y EST); toma EDT (UTC-4).
    expect(localDateTimeToUtc("2024-11-03T01:30", NY)?.toISOString()).toBe("2024-11-03T05:30:00.000Z");
  });

  it("acepta espacio y segundos; rechaza entradas inválidas", () => {
    expect(localDateTimeToUtc("2025-01-15 09:30:15", MX)?.toISOString()).toBe("2025-01-15T15:30:15.000Z");
    expect(localDateTimeToUtc("no-es-fecha", MX)).toBeNull();
    expect(localDateTimeToUtc("2025-13-01T09:30", MX)).toBeNull();
    expect(localDateTimeToUtc("2025-02-30T09:30", MX)).toBeNull();
    expect(localDateTimeToUtc("2025-01-15T25:30", MX)).toBeNull();
    expect(localDateTimeToUtc("", MX)).toBeNull();
  });
});

describe("dayBoundsUtc", () => {
  it("devuelve la cota UTC del día local", () => {
    const bounds = dayBoundsUtc("2025-01-15", MX);
    expect(bounds?.iniciaAt.toISOString()).toBe("2025-01-15T06:00:00.000Z");
    expect(bounds?.terminaAt.toISOString()).toBe("2025-01-16T06:00:00.000Z");
  });

  it("el día DST de primavera dura 23 horas en Nueva York", () => {
    const bounds = dayBoundsUtc("2024-03-10", NY);
    expect(bounds?.iniciaAt.toISOString()).toBe("2024-03-10T05:00:00.000Z");
    expect(bounds?.terminaAt.toISOString()).toBe("2024-03-11T04:00:00.000Z");
  });

  it("rechaza formato inválido", () => {
    expect(dayBoundsUtc("15/01/2025", MX)).toBeNull();
  });
});

describe("shiftDateKey / weekStartDateKey", () => {
  it("suma y resta días calendario respetando fin de mes", () => {
    expect(shiftDateKey("2025-01-15", 3)).toBe("2025-01-18");
    expect(shiftDateKey("2025-01-15", -20)).toBe("2024-12-26");
    expect(shiftDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDateKey("2025-02-30", 1)).toBeNull();
  });

  it("calcula el lunes de la semana local", () => {
    // 2025-01-15 fue miércoles.
    expect(weekStartDateKey("2025-01-15", MX)).toBe("2025-01-13");
    // 2025-01-12 fue domingo: con semana iniciando lunes pertenece a la semana anterior.
    expect(weekStartDateKey("2025-01-12", MX)).toBe("2025-01-06");
    expect(weekStartDateKey("2025-01-12", MX, 0)).toBe("2025-01-12");
  });
});

describe("parseFechaHoraInput", () => {
  it("respeta zonas explícitas (ISO con Z u offset)", () => {
    expect(parseFechaHoraInput("2025-01-15T15:30:00.000Z", MX)?.toISOString()).toBe("2025-01-15T15:30:00.000Z");
    expect(parseFechaHoraInput("2025-01-15T09:30:00-06:00", MX)?.toISOString()).toBe("2025-01-15T15:30:00.000Z");
  });

  it("interpreta datetime-local como hora de muro de la sucursal", () => {
    expect(parseFechaHoraInput("2025-01-15T09:30", MX)?.toISOString()).toBe("2025-01-15T15:30:00.000Z");
  });

  it("rechaza basura", () => {
    expect(parseFechaHoraInput("", MX)).toBeNull();
    expect(parseFechaHoraInput("abc", MX)).toBeNull();
  });
});

describe("isValidTimeZone / resolveTimeZone", () => {
  it("valida zonas IANA", () => {
    expect(isValidTimeZone(MX)).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });

  it("resuelve sucursal > organización > default", () => {
    expect(resolveTimeZone(NY, MX)).toBe(NY);
    expect(resolveTimeZone(null, MX)).toBe(MX);
    expect(resolveTimeZone(null, "Zona/Inventada")).toBe("America/Mexico_City");
    expect(resolveTimeZone(undefined, undefined)).toBe("America/Mexico_City");
  });
});
