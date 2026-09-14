import { describe, expect, it } from "vitest";

import { calcularComisiones, repartirPropina, type ReglaComision } from "./comisiones";

const linea = (overrides: Partial<Parameters<typeof calcularComisiones>[0][number]>) => ({
  detalleId: "l1",
  servicioId: "s1",
  usuarioId: "u1",
  precio: 300,
  cantidad: 1,
  ...overrides,
});

const regla = (overrides: Partial<ReglaComision>): ReglaComision => ({
  id: "r1",
  servicioId: "s1",
  rolId: null,
  tipo: "porcentaje",
  valor: 10,
  ...overrides,
});

describe("calcularComisiones", () => {
  it("aplica porcentaje sobre precio × cantidad", () => {
    const [c] = calcularComisiones(
      [linea({ precio: 500, cantidad: 2 })],
      [regla({ valor: 20 })],
      new Map(),
    );
    expect(c.monto).toBe(200);
    expect(c.base).toBe(1000);
  });

  it("aplica monto_fijo por unidad", () => {
    const [c] = calcularComisiones(
      [linea({ cantidad: 3 })],
      [regla({ tipo: "monto_fijo", valor: 25 })],
      new Map(),
    );
    expect(c.monto).toBe(75);
  });

  it("prefiere la regla de rol sobre la genérica", () => {
    const [c] = calcularComisiones(
      [linea({})],
      [regla({ id: "gen", valor: 10 }), regla({ id: "rol", rolId: "r-estilista", valor: 30 })],
      new Map([["u1", ["r-estilista"]]]),
    );
    expect(c.comisionId).toBe("rol");
    expect(c.monto).toBe(90);
  });

  it("ignora regla de otro rol", () => {
    const res = calcularComisiones(
      [linea({})],
      [regla({ rolId: "r-otro" })],
      new Map([["u1", ["r-estilista"]]]),
    );
    expect(res).toHaveLength(0);
  });

  it("sin regla o sin estilista no genera comisión", () => {
    expect(calcularComisiones([linea({ usuarioId: null })], [regla({})], new Map())).toHaveLength(0);
    expect(calcularComisiones([linea({})], [], new Map())).toHaveLength(0);
  });

  it("monto 0 no se registra", () => {
    expect(
      calcularComisiones([linea({})], [regla({ valor: 0 })], new Map()),
    ).toHaveLength(0);
  });
});

describe("repartirPropina", () => {
  it("sin propina devuelve vacío", () => {
    expect(repartirPropina(0, [linea({})], null)).toEqual([]);
  });

  it("va al único estilista con líneas", () => {
    expect(repartirPropina(100, [linea({})], null)).toEqual([{ usuarioId: "u1", monto: 100 }]);
  });

  it("reparte proporcional y cuadra centavos", () => {
    const res = repartirPropina(
      100,
      [
        linea({ detalleId: "l1", usuarioId: "a", precio: 100 }),
        linea({ detalleId: "l2", usuarioId: "b", precio: 200 }),
      ],
      null,
    );
    const total = res.reduce((s, r) => s + r.monto, 0);
    expect(total).toBe(100);
    expect(res.find((r) => r.usuarioId === "a")?.monto).toBe(33.33);
    expect(res.find((r) => r.usuarioId === "b")?.monto).toBe(66.67);
  });

  it("sin líneas con estilista usa el fallback", () => {
    expect(repartirPropina(50, [linea({ usuarioId: null })], "u9")).toEqual([
      { usuarioId: "u9", monto: 50 },
    ]);
  });

  it("sin estilista ni fallback devuelve vacío", () => {
    expect(repartirPropina(50, [], null)).toEqual([]);
  });
});
