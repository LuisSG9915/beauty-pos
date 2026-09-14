import { and, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { productos } from "@/db/schema/catalogs";
import { sucursales } from "@/db/schema/core";
import { inventarioStock, movimientosInventario } from "@/db/schema/operations";
import { actionError, actionSuccess, type ActionState } from "@/lib/action-state";

type Schema = typeof import("@/db/schema");

export type InventoryDb =
  | NodePgDatabase<Schema>
  | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export type InventoryMovementInput = {
  organizacionId: string;
  sucursalId: string;
  productoId: string;
  ventaId?: string | null;
  tipo: "entrada" | "salida" | "ajuste" | "venta" | "consumo" | "devolucion";
  /**
   * Entrada/salida/venta/consumo/devolución: cantidad positiva del movimiento
   * (devolución reingresa stock al cancelar una venta).
   * Ajuste: stock físico contado (valor absoluto).
   */
  cantidad: number;
  notas?: string | null;
  userId?: string | null;
};

export type InventoryMovementResult = {
  stockAnterior: number;
  delta: number;
  stockResultante: number;
};

/**
 * Cálculo puro del delta de stock. Entrada/salida/venta/consumo usan `cantidad`
 * positiva; `ajuste` interpreta `cantidad` como el conteo físico absoluto.
 * Devuelve `error` cuando el movimiento no es válido o dejaría stock negativo.
 */
export function resolveInventoryDelta(
  tipo: InventoryMovementInput["tipo"],
  cantidad: number,
  stockAnterior: number,
): { delta: number; stockResultante: number; error?: string } {
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { delta: 0, stockResultante: stockAnterior, error: "La cantidad debe ser un número válido mayor o igual a cero." };
  }
  if ((tipo === "entrada" || tipo === "salida" || tipo === "venta" || tipo === "consumo" || tipo === "devolucion") && cantidad <= 0) {
    return { delta: 0, stockResultante: stockAnterior, error: "La cantidad del movimiento debe ser mayor a cero." };
  }
  const delta =
    tipo === "ajuste"
      ? cantidad - stockAnterior
      : tipo === "entrada" || tipo === "devolucion"
        ? cantidad
        : -cantidad;
  if (tipo === "ajuste" && delta === 0) {
    return { delta, stockResultante: stockAnterior, error: "El stock físico ya coincide con el registrado." };
  }
  const stockResultante = stockAnterior + delta;
  if (stockResultante < 0) {
    return {
      delta,
      stockResultante,
      error: `Stock insuficiente: hay ${stockAnterior.toFixed(3)} y quedaría ${stockResultante.toFixed(3)}.`,
    };
  }
  return { delta, stockResultante };
}

/**
 * Aplica un movimiento de stock dentro de la transacción del caller. La fila de
 * `inventario_stock` se crea si falta y luego se bloquea con `FOR UPDATE`, de
 * modo que dos cobros/ajustes concurrentes no pueden leer el mismo stock base.
 */
export async function applyInventoryMovement(
  db: InventoryDb,
  input: InventoryMovementInput,
): Promise<ActionState<InventoryMovementResult>> {
  if (!Number.isFinite(input.cantidad) || input.cantidad < 0) {
    return actionError("La cantidad debe ser un número válido mayor o igual a cero.");
  }

  const [sucursalRows, productoRows] = await Promise.all([
    db
      .select({ id: sucursales.id, activo: sucursales.activo })
      .from(sucursales)
      .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
      .limit(1),
    db
      .select({ id: productos.id, activo: productos.activo })
      .from(productos)
      .where(and(eq(productos.id, input.productoId), eq(productos.organizacionId, input.organizacionId)))
      .limit(1),
  ]);
  if (!sucursalRows[0]?.activo) return actionError("La sucursal no existe, está inactiva o no pertenece a la organización.");
  if (!productoRows[0]) return actionError("El producto no existe o no pertenece a la organización.");

  await db
    .insert(inventarioStock)
    .values({
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      productoId: input.productoId,
      stockActual: "0",
      createdBy: input.userId ?? null,
    })
    .onConflictDoNothing({
      target: [inventarioStock.sucursalId, inventarioStock.productoId],
    });

  const [stock] = await db
    .select({ id: inventarioStock.id, stockActual: inventarioStock.stockActual })
    .from(inventarioStock)
    .where(
      and(
        eq(inventarioStock.organizacionId, input.organizacionId),
        eq(inventarioStock.sucursalId, input.sucursalId),
        eq(inventarioStock.productoId, input.productoId),
      ),
    )
    .limit(1)
    .for("update");

  if (!stock) return actionError("No se pudo inicializar el stock del producto.");
  const stockAnterior = Number(stock.stockActual);
  const resolved = resolveInventoryDelta(input.tipo, input.cantidad, stockAnterior);
  if (resolved.error) return actionError(resolved.error);
  const { delta, stockResultante } = resolved;

  if ((input.tipo === "salida" || input.tipo === "ajuste") && !input.notas?.trim()) {
    return actionError("Indica el motivo de la salida o ajuste.");
  }

  await db
    .update(inventarioStock)
    .set({ stockActual: stockResultante.toFixed(3), updatedBy: input.userId ?? null })
    .where(eq(inventarioStock.id, stock.id));
  await db.insert(movimientosInventario).values({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    productoId: input.productoId,
    ventaId: input.ventaId ?? null,
    tipo: input.tipo,
    cantidad: delta.toFixed(3),
    stockResultante: stockResultante.toFixed(3),
    notas: input.notas?.trim() || null,
    createdBy: input.userId ?? null,
  });

  return actionSuccess("Movimiento registrado.", { stockAnterior, delta, stockResultante });
}
