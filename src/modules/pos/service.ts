/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray } from "drizzle-orm";

import { withRetry } from "@/db/retry";
import { comisiones, membresias, paquetes, relServiciosInsumos } from "@/db/schema/catalogs";
import {
  anticipos,
  citas,
  clienteMembresias,
  clientePaquetes,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  inventarioStock,
  movimientosInventario,
  ventas,
} from "@/db/schema/operations";
import { todayDateInput } from "@/lib/format";
import { canTransitionEstado } from "@/modules/agenda";
import { calcularComisiones, repartirPropina } from "@/modules/pos/comisiones";
import { sumarDias } from "@/modules/pos/membresias";
import { getRolesPorUsuario } from "@/modules/pos/ticket";

export type ItemServicioVenta = {
  id?: string;
  servicioId: string;
  usuarioId?: string | null;
  nombre?: string;
  precio: number;
  cantidad: number;
};

export type ItemProductoVenta = {
  id?: string;
  productoId: string;
  nombre?: string;
  precio: number;
  cantidad: number;
};

export type PagoVenta = {
  medioPagoId: string;
  monto: number;
  recibido?: number;
  cambio?: number;
  referencia?: string | null;
};

export type PaqueteVenta = {
  paqueteId: string;
  cantidad: number;
};

export type MembresiaVenta = {
  membresiaId: string;
  cantidad: number;
};

export type EjecutarVentaInput = {
  organizacionId: string;
  sucursalId: string;
  usuarioId?: string | null;
  clienteId?: string | null;
  citaId?: string | null;
  corteId?: string | null;
  idempotencyKey?: string | null;
  ventaId?: string | null;
  servicios?: ItemServicioVenta[];
  productos?: ItemProductoVenta[];
  pagos: PagoVenta[];
  subtotal?: number;
  descuento?: number;
  descuentoPromocion?: number;
  descuentoMembresia?: number;
  promocionId?: string | null;
  membresiaId?: string | null;
  total?: number;
  propina?: number;
  notas?: string | null;
  paquetes?: PaqueteVenta[];
  membresias?: MembresiaVenta[];
  anticiposAplicados?: string[];
  zonaHoraria?: string;
  serviciosInsumos?: Array<{ servicioId: string; productoId: string; cantidad: string }>;
  reglasComision?: Array<{ id: string; servicioId: string | null; rolId: string | null; tipo: string; valor: string }>;
  userId?: string | null;
};

export type ResultadoVentaTransaccional = {
  ventaId: string;
  folio: string;
  yaProcesada: boolean;
};

export async function ejecutarVentaTransaccional(
  db: any,
  input: EjecutarVentaInput,
): Promise<ResultadoVentaTransaccional> {
  const ejecutarTx = async (tx: any): Promise<ResultadoVentaTransaccional> => {
    // Paso 1 (Idempotencia): Si input.idempotencyKey viene definido, consultar si ya existe la venta.
    if (input.idempotencyKey) {
      const [existente] = await tx
        .select({ id: ventas.id, estado: ventas.estado })
        .from(ventas)
        .where(
          and(
            eq(ventas.sucursalId, input.sucursalId),
            eq(ventas.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);

      if (existente) {
        return {
          ventaId: existente.id,
          folio: existente.id.slice(0, 8),
          yaProcesada: true,
        };
      }
    }

    let ventaId = input.ventaId;

    if (ventaId) {
      const [ventaExistente] = await tx
        .select({ id: ventas.id, estado: ventas.estado })
        .from(ventas)
        .where(
          and(
            eq(ventas.id, ventaId),
            eq(ventas.organizacionId, input.organizacionId),
          ),
        )
        .limit(1)
        .for("update");

      if (!ventaExistente) {
        throw new Error("Venta no encontrada.");
      }

      if (ventaExistente.estado === "completada") {
        return {
          ventaId: ventaExistente.id,
          folio: ventaExistente.id.slice(0, 8),
          yaProcesada: true,
        };
      }

      await tx
        .update(ventas)
        .set({
          estado: "completada",
          cobradaAt: new Date(),
          corteId: input.corteId ?? null,
          subtotal: (input.subtotal ?? 0).toFixed(2),
          total: (input.total ?? 0).toFixed(2),
          propina: (input.propina ?? 0).toFixed(2),
          idempotencyKey: input.idempotencyKey ?? null,
          updatedBy: input.userId ?? null,
        })
        .where(eq(ventas.id, ventaId));
    } else {
      const [nuevaVenta] = await tx
        .insert(ventas)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: input.usuarioId ?? input.userId ?? null,
          clienteId: input.clienteId ?? null,
          citaId: input.citaId ?? null,
          corteId: input.corteId ?? null,
          estado: "completada",
          cobradaAt: new Date(),
          subtotal: (input.subtotal ?? 0).toFixed(2),
          descuento: (input.descuento ?? 0).toFixed(2),
          promocionId: input.promocionId ?? null,
          descuentoPromocion: (input.descuentoPromocion ?? 0).toFixed(2),
          membresiaId: input.membresiaId ?? null,
          descuentoMembresia: (input.descuentoMembresia ?? 0).toFixed(2),
          total: (input.total ?? 0).toFixed(2),
          propina: (input.propina ?? 0).toFixed(2),
          idempotencyKey: input.idempotencyKey ?? null,
          notas: input.notas ?? null,
          createdBy: input.userId ?? null,
        })
        .returning({ id: ventas.id });

      if (!nuevaVenta) {
        throw new Error("No se pudo crear el registro de venta.");
      }
      ventaId = nuevaVenta.id;
    }

    if (!ventaId) {
      throw new Error("No se pudo obtener el identificador de la venta.");
    }
    const finalVentaId = ventaId;

    // Insertar líneas no persistidas (ej. venta offline o venta directa)
    const serviciosPorInsertar = (input.servicios ?? []).filter((s) => !s.id);
    let serviciosParaComisiones = input.servicios ?? [];

    if (serviciosPorInsertar.length > 0) {
      const inserted = await tx
        .insert(detalleVentasServicios)
        .values(
          serviciosPorInsertar.map((s) => ({
            ventaId: finalVentaId,
            servicioId: s.servicioId,
            usuarioId: s.usuarioId ?? null,
            nombre: s.nombre ?? null,
            precio: s.precio.toFixed(2),
            cantidad: s.cantidad,
            createdBy: input.userId ?? null,
          })),
        )
        .returning({
          id: detalleVentasServicios.id,
          servicioId: detalleVentasServicios.servicioId,
          usuarioId: detalleVentasServicios.usuarioId,
          precio: detalleVentasServicios.precio,
          cantidad: detalleVentasServicios.cantidad,
        });

      serviciosParaComisiones = inserted.map((row: any) => ({
        id: row.id,
        servicioId: row.servicioId,
        usuarioId: row.usuarioId,
        precio: Number(row.precio),
        cantidad: row.cantidad,
      }));
    }

    const productosPorInsertar = (input.productos ?? []).filter((p) => !p.id);
    if (productosPorInsertar.length > 0) {
      await tx.insert(detalleVentasProductos).values(
        productosPorInsertar.map((p) => ({
          ventaId: finalVentaId,
          productoId: p.productoId,
          nombre: p.nombre ?? null,
          precio: p.precio.toFixed(2),
          cantidad: p.cantidad,
          createdBy: input.userId ?? null,
        })),
      );
    }

    // Insertar pagos en multi-row
    if (input.pagos.length > 0) {
      await tx.insert(detalleVentasMediosPagos).values(
        input.pagos.map((pago) => ({
          ventaId: finalVentaId,
          medioPagoId: pago.medioPagoId,
          monto: pago.monto.toFixed(2),
          recibido: (pago.recibido ?? pago.monto).toFixed(2),
          cambio: (pago.cambio ?? 0).toFixed(2),
          referencia: pago.referencia || null,
          createdBy: input.userId ?? null,
        })),
      );
    }

    // Anticipos ligados a la venta
    if (input.anticiposAplicados && input.anticiposAplicados.length > 0) {
      await tx
        .update(anticipos)
        .set({ estado: "aplicado", ventaId: finalVentaId, updatedBy: input.userId ?? null })
        .where(inArray(anticipos.id, input.anticiposAplicados));
    }

    // Paquetes vendidos
    if (input.paquetes && input.paquetes.length > 0 && input.clienteId) {
      const paqueteIds = [...new Set(input.paquetes.map((p) => p.paqueteId))];
      const defs = await tx
        .select({ id: paquetes.id, sesiones: paquetes.sesiones })
        .from(paquetes)
        .where(inArray(paquetes.id, paqueteIds));
      const sesionesPorPaquete = new Map<string, number>(defs.map((d: any) => [d.id, Number(d.sesiones)]));
      const filasPaquetes: (typeof clientePaquetes.$inferInsert)[] = [];
      for (const linea of input.paquetes) {
        const sesiones = sesionesPorPaquete.get(linea.paqueteId) ?? 0;
        for (let i = 0; i < linea.cantidad && sesiones > 0; i++) {
          filasPaquetes.push({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            clienteId: input.clienteId,
            paqueteId: linea.paqueteId,
            ventaId: finalVentaId,
            sesionesTotal: sesiones,
            sesionesRestantes: sesiones,
            estado: "vigente",
            createdBy: input.userId ?? null,
          });
        }
      }
      if (filasPaquetes.length > 0) {
        await tx.insert(clientePaquetes).values(filasPaquetes);
      }
    }

    // Membresías vendidas
    if (input.membresias && input.membresias.length > 0 && input.clienteId) {
      const membresiaIds = [...new Set(input.membresias.map((m) => m.membresiaId))];
      const defs = await tx
        .select({ id: membresias.id, duracionDias: membresias.duracionDias })
        .from(membresias)
        .where(inArray(membresias.id, membresiaIds));
      const duracionPorMembresia = new Map<string, number>(defs.map((d: any) => [d.id, Number(d.duracionDias)]));
      const hoy = todayDateInput(input.zonaHoraria ?? undefined);
      const filasMembresias: (typeof clienteMembresias.$inferInsert)[] = [];
      for (const linea of input.membresias) {
        const duracion = duracionPorMembresia.get(linea.membresiaId) ?? 0;
        for (let i = 0; i < linea.cantidad && duracion > 0; i++) {
          filasMembresias.push({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            clienteId: input.clienteId,
            membresiaId: linea.membresiaId,
            ventaId: finalVentaId,
            vigenciaDesde: hoy,
            vigenciaHasta: sumarDias(hoy, duracion),
            estado: "vigente",
            createdBy: input.userId ?? null,
          });
        }
      }
      if (filasMembresias.length > 0) {
        await tx.insert(clienteMembresias).values(filasMembresias);
      }
    }

    // Comisiones por profesional
    const serviciosConId = serviciosParaComisiones.filter((s) => s.id);
    const servicioIds = [...new Set(serviciosConId.map((s) => s.servicioId))];
    if (servicioIds.length > 0) {
      const reglas =
        input.reglasComision ??
        (await tx
          .select({
            id: comisiones.id,
            servicioId: comisiones.servicioId,
            rolId: comisiones.rolId,
            tipo: comisiones.tipo,
            valor: comisiones.valor,
          })
          .from(comisiones)
          .where(
            and(
              inArray(comisiones.servicioId, servicioIds),
              eq(comisiones.organizacionId, input.organizacionId),
              eq(comisiones.activo, true),
            ),
          ));

      const usuarioIds = [...new Set(serviciosConId.map((l) => l.usuarioId).filter((u): u is string => Boolean(u)))];
      const rolesPorUsuario = await getRolesPorUsuario(input.organizacionId, usuarioIds);

      const comisionesCalc = calcularComisiones(
        serviciosConId.map((l) => ({
          detalleId: l.id!,
          servicioId: l.servicioId,
          usuarioId: l.usuarioId ?? null,
          precio: Number(l.precio),
          cantidad: l.cantidad,
        })),
        reglas.map((r: any) => ({ ...r, tipo: r.tipo as "porcentaje" | "monto_fijo", valor: Number(r.valor) })),
        rolesPorUsuario,
      );

      if (comisionesCalc.length > 0) {
        await tx.insert(detalleVentasComisiones).values(
          comisionesCalc.map((c) => ({
            ventaId: finalVentaId,
            detalleVentaServicioId: c.detalleVentaServicioId,
            usuarioId: c.usuarioId,
            comisionId: c.comisionId,
            tipo: c.tipo,
            valor: String(c.valor),
            base: c.base.toFixed(2),
            monto: c.monto.toFixed(2),
            createdBy: input.userId ?? null,
          })),
        );
      }
    }

    // Propinas repartidas
    if (input.propina && input.propina > 0) {
      const propinasCalc = repartirPropina(
        input.propina,
        serviciosParaComisiones.map((l) => ({
          detalleId: l.id ?? "",
          servicioId: l.servicioId,
          usuarioId: l.usuarioId ?? null,
          precio: Number(l.precio),
          cantidad: l.cantidad,
        })),
        input.usuarioId ?? null,
      );
      if (propinasCalc.length > 0) {
        await tx.insert(detalleVentasPropinas).values(
          propinasCalc.map((p) => ({
            ventaId: finalVentaId,
            usuarioId: p.usuarioId,
            monto: p.monto.toFixed(2),
            createdBy: input.userId ?? null,
          })),
        );
      }
    }

    // Paso 2 (Eliminación de N+1 en inventario e insumos):
    const productosVendidos = input.productos ?? [];
    const serviciosVendidos = input.servicios ?? [];
    const servicioIdsVendidos = [...new Set(serviciosVendidos.map((s) => s.servicioId))];

    const insumos =
      input.serviciosInsumos ??
      (servicioIdsVendidos.length > 0
        ? await tx
            .select({
              servicioId: relServiciosInsumos.servicioId,
              productoId: relServiciosInsumos.productoId,
              cantidad: relServiciosInsumos.cantidad,
            })
            .from(relServiciosInsumos)
            .where(
              and(
                inArray(relServiciosInsumos.servicioId, servicioIdsVendidos),
                eq(relServiciosInsumos.activo, true),
              ),
            )
        : []);

    const consumoProductos = new Map<string, number>();
    for (const p of productosVendidos) {
      consumoProductos.set(p.productoId, (consumoProductos.get(p.productoId) ?? 0) + p.cantidad);
    }

    const porServicio = new Map<string, number>();
    for (const s of serviciosVendidos) {
      porServicio.set(s.servicioId, (porServicio.get(s.servicioId) ?? 0) + s.cantidad);
    }

    const consumoInsumos = new Map<string, number>();
    for (const insumo of insumos) {
      const veces = porServicio.get(insumo.servicioId) ?? 0;
      consumoInsumos.set(
        insumo.productoId,
        (consumoInsumos.get(insumo.productoId) ?? 0) + Number(insumo.cantidad) * veces,
      );
    }

    const todosProductoIds = [
      ...new Set([...consumoProductos.keys(), ...consumoInsumos.keys()]),
    ];

    if (todosProductoIds.length > 0) {
      await tx
        .insert(inventarioStock)
        .values(
          todosProductoIds.map((pId) => ({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            productoId: pId,
            stockActual: "0",
            createdBy: input.userId ?? null,
          })),
        )
        .onConflictDoNothing({
          target: [inventarioStock.sucursalId, inventarioStock.productoId],
        });

      const stocks = await tx
        .select({
          id: inventarioStock.id,
          productoId: inventarioStock.productoId,
          stockActual: inventarioStock.stockActual,
        })
        .from(inventarioStock)
        .where(
          and(
            eq(inventarioStock.organizacionId, input.organizacionId),
            eq(inventarioStock.sucursalId, input.sucursalId),
            inArray(inventarioStock.productoId, todosProductoIds),
          ),
        )
        .for("update");

      const stockMap = new Map<string, { id: string; stockActual: string }>(
        stocks.map((s: any) => [s.productoId, s]),
      );
      const filasMovimientos: (typeof movimientosInventario.$inferInsert)[] = [];

      for (const pId of todosProductoIds) {
        const stockRow = stockMap.get(pId);
        if (!stockRow) continue;
        let stockNum = Number(stockRow.stockActual);

        const cantVenta = consumoProductos.get(pId) ?? 0;
        if (cantVenta > 0) {
          stockNum = Math.round((stockNum - cantVenta) * 1000) / 1000;
          filasMovimientos.push({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            productoId: pId,
            ventaId: finalVentaId,
            tipo: "venta",
            cantidad: cantVenta.toFixed(3),
            stockResultante: stockNum.toFixed(3),
            notas: null,
            createdBy: input.userId ?? null,
          });
        }

        const cantConsumo = consumoInsumos.get(pId) ?? 0;
        if (cantConsumo > 0) {
          stockNum = Math.round((stockNum - cantConsumo) * 1000) / 1000;
          filasMovimientos.push({
            organizacionId: input.organizacionId,
            sucursalId: input.sucursalId,
            productoId: pId,
            ventaId: finalVentaId,
            tipo: "consumo",
            cantidad: cantConsumo.toFixed(3),
            stockResultante: stockNum.toFixed(3),
            notas: "Consumo por servicio vendido",
            createdBy: input.userId ?? null,
          });
        }

        await tx
          .update(inventarioStock)
          .set({
            stockActual: stockNum.toFixed(3),
            updatedBy: input.userId ?? null,
          })
          .where(eq(inventarioStock.id, stockRow.id));
      }

      if (filasMovimientos.length > 0) {
        await tx.insert(movimientosInventario).values(filasMovimientos);
      }
    }

    // Actualizar cita si existe
    if (input.citaId) {
      const [cita] = await tx
        .select({ id: citas.id, estado: citas.estado })
        .from(citas)
        .where(
          and(
            eq(citas.id, input.citaId),
            eq(citas.organizacionId, input.organizacionId),
          ),
        )
        .limit(1);

      if (cita && cita.estado !== "completada") {
        if (!canTransitionEstado(cita.estado, "completada")) {
          throw new Error(`La cita está en estado "${cita.estado}" y no puede completarse.`);
        }
        await tx
          .update(citas)
          .set({ estado: "completada", updatedBy: input.userId ?? null })
          .where(eq(citas.id, cita.id));
      }
    }

    return {
      ventaId: finalVentaId,
      folio: finalVentaId.slice(0, 8),
      yaProcesada: false,
    };
  };

  return withRetry(async () => {
    if (typeof db.transaction === "function") {
      return db.transaction(ejecutarTx);
    }
    return ejecutarTx(db);
  });
}

/** Aliases para paridad en sincronización offline y auditorías */
export const ejecutarInsercionVentaLote = ejecutarVentaTransaccional;
export const serviciosInsumos = relServiciosInsumos;

