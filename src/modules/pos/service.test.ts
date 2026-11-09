/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

import { ejecutarVentaTransaccional, type EjecutarVentaInput } from "./service";

describe("ejecutarVentaTransaccional - Idempotencia y Motor Unificado", () => {
  it("retorna yaProcesada: true si la venta ya existe con el mismo idempotencyKey", async () => {
    const fakeVentaExistente = {
      id: "11111111-1111-1111-1111-111111111111",
      estado: "completada",
    };

    const mockSelectFromVentas = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([fakeVentaExistente]),
      }),
    });

    const fakeDb = {
      select: vi.fn().mockImplementation(() => ({
        from: mockSelectFromVentas,
      })),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn().mockImplementation(async (callback: any) => callback(fakeDb)),
    };

    const input: EjecutarVentaInput = {
      organizacionId: "org-1",
      sucursalId: "suc-1",
      idempotencyKey: "idem-key-123",
      pagos: [{ medioPagoId: "medio-1", monto: 100 }],
      servicios: [],
      productos: [],
    };

    const resultado = await ejecutarVentaTransaccional(fakeDb, input);

    expect(resultado).toEqual({
      ventaId: "11111111-1111-1111-1111-111111111111",
      folio: "11111111",
      yaProcesada: true,
    });
    // No debe haber hecho ningún insert ni update
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(fakeDb.update).not.toHaveBeenCalled();
  });

  it("retorna yaProcesada: true si ventaId existente ya tiene estado completada", async () => {
    let selectCount = 0;
    const fakeDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCount++;
              if (selectCount === 1) {
                // Idempotency check: not found by idempotencyKey
                return Promise.resolve([]);
              }
              // Lock ventaId check: already completed
              return {
                for: vi.fn().mockResolvedValue([{
                  id: "22222222-2222-2222-2222-222222222222",
                  estado: "completada",
                }]),
              };
            }),
          }),
        }),
      })),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn().mockImplementation(async (cb: any) => cb(fakeDb)),
    };

    const input: EjecutarVentaInput = {
      organizacionId: "org-1",
      sucursalId: "suc-1",
      ventaId: "22222222-2222-2222-2222-222222222222",
      idempotencyKey: "idem-key-456",
      pagos: [{ medioPagoId: "medio-1", monto: 100 }],
    };

    const resultado = await ejecutarVentaTransaccional(fakeDb, input);

    expect(resultado).toEqual({
      ventaId: "22222222-2222-2222-2222-222222222222",
      folio: "22222222",
      yaProcesada: true,
    });
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it("procesa una venta nueva con idempotencyKey y descuenta inventario en batch sin N+1", async () => {
    const insertedVentaId = "33333333-3333-3333-3333-333333333333";
    const insertedMoves: any[] = [];
    const insertedPagos: any[] = [];
    const stockUpdates: any[] = [];

    let folioContador = 0;
    const fakeDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // idempotency check: not found
            for: vi.fn().mockResolvedValue([
              { id: "stock-1", productoId: "prod-1", stockActual: "10.000" },
              { id: "stock-2", productoId: "prod-2", stockActual: "5.000" },
            ]),
          }),
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val: any) => {
          // folios_venta: objeto simple con `ultimo`, sin organizacionId
          if (val && !Array.isArray(val) && "ultimo" in val) {
            return {
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ ultimo: ++folioContador }]),
              }),
            };
          }
          if (Array.isArray(val) && val[0]?.tipo === "venta") {
            insertedMoves.push(...val);
          } else if (Array.isArray(val) && val[0]?.medioPagoId) {
            insertedPagos.push(...val);
          }
          return {
            returning: vi.fn().mockResolvedValue([{ id: insertedVentaId }]),
            onConflictDoNothing: vi.fn().mockResolvedValue([]),
          };
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((updates: any) => {
          stockUpdates.push(updates);
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }),
      })),
      transaction: vi.fn().mockImplementation(async (cb: any) => cb(fakeDb)),
    };

    const input: EjecutarVentaInput = {
      organizacionId: "org-1",
      sucursalId: "suc-1",
      idempotencyKey: "unique-offline-uuid-789",
      subtotal: 350,
      total: 350,
      pagos: [
        { medioPagoId: "medio-efectivo", monto: 350, recibido: 400, cambio: 50 },
      ],
      productos: [
        { productoId: "prod-1", precio: 200, cantidad: 2 },
        { productoId: "prod-2", precio: 150, cantidad: 1 },
      ],
      userId: "user-1",
    };

    const resultado = await ejecutarVentaTransaccional(fakeDb, input);

    expect(resultado).toEqual({
      ventaId: insertedVentaId,
      folio: "1",
      yaProcesada: false,
    });

    // Multi-row insert de pagos
    expect(insertedPagos).toHaveLength(1);
    expect(insertedPagos[0]).toMatchObject({
      ventaId: insertedVentaId,
      medioPagoId: "medio-efectivo",
      monto: "350.00",
      recibido: "400.00",
      cambio: "50.00",
    });

    // Multi-row insert de movimientos de inventario acumulados
    expect(insertedMoves).toHaveLength(2);
    expect(insertedMoves[0]).toMatchObject({
      productoId: "prod-1",
      tipo: "venta",
      cantidad: "2.000",
      stockResultante: "8.000",
    });
    expect(insertedMoves[1]).toMatchObject({
      productoId: "prod-2",
      tipo: "venta",
      cantidad: "1.000",
      stockResultante: "4.000",
    });

    expect(stockUpdates).toHaveLength(2);
    expect(stockUpdates[0]).toMatchObject({ stockActual: "8.000", updatedBy: "user-1" });
    expect(stockUpdates[1]).toMatchObject({ stockActual: "4.000", updatedBy: "user-1" });
  });
});

describe("ejecutarVentaTransaccional - folio consecutivo por sucursal", () => {
  type FakeDbFolio = {
    db: any;
    folioInserts: any[];
    ventaInserts: any[];
    updateSets: any[];
  };

  // Mock mínimo para ventas sin servicios/productos: solo folios_venta,
  // ventas y pagos pasan por insert; nada toca select/update/stock.
  function crearFakeDbFolio(ventaBloqueada?: any): FakeDbFolio {
    const contadores = new Map<string, number>();
    const folioInserts: any[] = [];
    const ventaInserts: any[] = [];
    const updateSets: any[] = [];

    const fakeDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (!ventaBloqueada) return Promise.resolve([]);
              return { for: vi.fn().mockResolvedValue([ventaBloqueada]) };
            }),
          }),
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((val: any) => {
          if (Array.isArray(val)) return {};
          if ("ultimo" in val) {
            folioInserts.push(val);
            const siguiente = (contadores.get(val.sucursalId) ?? 0) + 1;
            contadores.set(val.sucursalId, siguiente);
            return {
              onConflictDoUpdate: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ ultimo: siguiente }]),
              }),
            };
          }
          ventaInserts.push(val);
          return {
            returning: vi.fn().mockResolvedValue([{ id: `venta-${ventaInserts.length}` }]),
          };
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((set: any) => {
          updateSets.push(set);
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      })),
      transaction: vi.fn().mockImplementation(async (cb: any) => cb(fakeDb)),
    };

    return { db: fakeDb, folioInserts, ventaInserts, updateSets };
  }

  const inputBase = {
    organizacionId: "org-1",
    pagos: [{ medioPagoId: "medio-1", monto: 100 }],
    total: 100,
  };

  it("dos ventas directas seguidas reciben folios consecutivos y lo persisten", async () => {
    const { db, folioInserts, ventaInserts } = crearFakeDbFolio();

    const r1 = await ejecutarVentaTransaccional(db, { ...inputBase, sucursalId: "suc-1" });
    const r2 = await ejecutarVentaTransaccional(db, { ...inputBase, sucursalId: "suc-1" });

    expect(r1.folio).toBe("1");
    expect(r2.folio).toBe("2");
    expect(folioInserts).toHaveLength(2);
    expect(folioInserts.every((f) => f.sucursalId === "suc-1")).toBe(true);
    expect(ventaInserts[0].folio).toBe(1);
    expect(ventaInserts[1].folio).toBe(2);
  });

  it("sucursales distintas numeran por separado", async () => {
    const { db, folioInserts } = crearFakeDbFolio();

    const r1 = await ejecutarVentaTransaccional(db, { ...inputBase, sucursalId: "suc-1" });
    const r2 = await ejecutarVentaTransaccional(db, { ...inputBase, sucursalId: "suc-2" });
    const r3 = await ejecutarVentaTransaccional(db, { ...inputBase, sucursalId: "suc-1" });

    expect([r1.folio, r2.folio, r3.folio]).toEqual(["1", "1", "2"]);
    expect(folioInserts.map((f) => f.sucursalId)).toEqual(["suc-1", "suc-2", "suc-1"]);
  });

  it("cobrar una venta en proceso le asigna folio y lo escribe en el update", async () => {
    const { db, folioInserts, ventaInserts, updateSets } = crearFakeDbFolio({
      id: "venta-uuid-1",
      estado: "en_proceso",
      folio: null,
      sucursalId: "suc-1",
    });

    const resultado = await ejecutarVentaTransaccional(db, {
      ...inputBase,
      sucursalId: "suc-1",
      ventaId: "venta-uuid-1",
    });

    expect(resultado).toEqual({ ventaId: "venta-uuid-1", folio: "1", yaProcesada: false });
    expect(folioInserts).toHaveLength(1);
    expect(ventaInserts).toHaveLength(0);
    expect(updateSets[0]).toMatchObject({ estado: "completada", folio: 1 });
  });

  it("una venta cancelada conserva su folio y no consume otro", async () => {
    const { db, folioInserts, updateSets } = crearFakeDbFolio({
      id: "venta-uuid-2",
      estado: "cancelada",
      folio: 9,
      sucursalId: "suc-1",
    });

    const resultado = await ejecutarVentaTransaccional(db, {
      ...inputBase,
      sucursalId: "suc-1",
      ventaId: "venta-uuid-2",
    });

    expect(resultado).toEqual({ ventaId: "venta-uuid-2", folio: "9", yaProcesada: false });
    expect(folioInserts).toHaveLength(0);
    expect(updateSets[0]).toMatchObject({ estado: "completada", folio: 9 });
  });

  it("el reintento idempotente devuelve el folio guardado sin consumir otro", async () => {
    const fakeDb: any = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "venta-uuid-3",
                estado: "completada",
                folio: 42,
              },
            ]),
          }),
        }),
      })),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn().mockImplementation(async (cb: any) => cb(fakeDb)),
    };

    const resultado = await ejecutarVentaTransaccional(fakeDb, {
      ...inputBase,
      sucursalId: "suc-1",
      idempotencyKey: "idem-1",
    });

    expect(resultado).toEqual({
      ventaId: "venta-uuid-3",
      folio: "42",
      yaProcesada: true,
    });
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });
});
