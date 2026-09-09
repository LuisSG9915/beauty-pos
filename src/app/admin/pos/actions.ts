"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { citas, detalleCitasServicios, detalleVentasMediosPagos, detalleVentasServicios, ventas } from "@/db/schema/operations";
import { catMediosPago } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

const cobroSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  medioPagoId: z.string().uuid(),
  referencia: z.string().trim().max(120).optional().or(z.literal("")),
});

export type CobroActionState = { error?: string; success?: boolean };

export async function cobrarCita(_previousState: CobroActionState, formData: FormData): Promise<CobroActionState> {
  const result = cobroSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del cobro." };
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();

  const [cita] = await db.select().from(citas).where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId))).limit(1);
  if (!cita) return { error: "Cita no encontrada." };
  if (cita.estado === "completada") return { error: "Esta cita ya fue cobrada." };

  const [medio] = await db.select().from(catMediosPago).where(and(eq(catMediosPago.id, input.medioPagoId), eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.activo, true))).limit(1);
  if (!medio) return { error: "Selecciona un medio de pago válido." };
  if (medio.categoria !== "efectivo" && !input.referencia) return { error: "Este medio de pago requiere referencia." };

  const serviciosCita = await db.select({ servicioId: detalleCitasServicios.servicioId, precio: detalleCitasServicios.precio }).from(detalleCitasServicios).where(and(eq(detalleCitasServicios.citaId, cita.id), eq(detalleCitasServicios.activo, true)));
  const subtotal = serviciosCita.reduce((sum, s) => sum + parseFloat(s.precio), 0);

  const [venta] = await db.insert(ventas).values({
    organizacionId: input.organizacionId,
    sucursalId: cita.sucursalId,
    citaId: cita.id,
    clienteId: cita.clienteId,
    usuarioId: cita.usuarioId,
    estado: "completada",
    subtotal: subtotal.toFixed(2),
    descuento: "0",
    total: subtotal.toFixed(2),
    createdBy: user.id,
  }).returning({ id: ventas.id });

  for (const s of serviciosCita) {
    await db.insert(detalleVentasServicios).values({ ventaId: venta.id, servicioId: s.servicioId, precio: s.precio, createdBy: user.id });
  }

  await db.insert(detalleVentasMediosPagos).values({
    ventaId: venta.id,
    medioPagoId: input.medioPagoId,
    monto: subtotal.toFixed(2),
    referencia: input.referencia || null,
    createdBy: user.id,
  });

  await db.update(citas).set({ estado: "completada", updatedBy: user.id }).where(and(eq(citas.id, cita.id), eq(citas.organizacionId, input.organizacionId)));

  revalidatePath("/admin/agenda");
  revalidatePath("/admin/pos");
  return { success: true };
}
