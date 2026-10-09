"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { actionError, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { assertBranchScope, checkPermission } from "@/lib/auth/authorization";
import { applyInventoryMovement, type InventoryMovementResult } from "@/modules/inventory";

const movimientoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  productoId: z.string().uuid(),
  tipo: z.enum(["entrada", "salida", "ajuste"]),
  cantidad: z.coerce.number().min(0, "La cantidad no puede ser negativa."),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MovimientoActionState = ActionState<InventoryMovementResult>;

export async function registrarMovimiento(
  _previousState: MovimientoActionState,
  formData: FormData,
): Promise<MovimientoActionState> {
  const parsed = parseWithSchema(movimientoSchema, Object.fromEntries(formData.entries()), "Revisa los datos del movimiento.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "inventario.editar");
  if (!access) return actionError("No tienes permiso para editar el inventario.");
  const { user } = access;
  const sucursalValida = await assertBranchScope(access, input.sucursalId);
  if (!sucursalValida) return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx) =>
        applyInventoryMovement(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        productoId: input.productoId,
        tipo: input.tipo,
        cantidad: input.cantidad,
        notas: input.notas,
        userId: user.id,
      }),
      ),
    );

    if (!outcome.success) return outcome;
    await auditEvent(db, {
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      usuarioId: user.id,
      accion: `inventario.${input.tipo}`,
      entidad: "producto",
      entidadId: input.productoId,
      detalle: { cantidad: input.cantidad, notas: input.notas || undefined },
    });
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/pos");
    return {
      ...outcome,
      message: `Movimiento registrado. Stock resultante: ${outcome.data?.stockResultante.toFixed(3) ?? "0.000"}`,
    };
  } catch (error) {
    console.error("registrarMovimiento", error);
    return actionError("No se pudo registrar el movimiento. Intenta de nuevo.");
  }
}
