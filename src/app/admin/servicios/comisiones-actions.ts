"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catRoles } from "@/db/schema/access";
import { comisiones, servicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const commissionSchema = z.object({
  organizacionId: z.string().uuid(),
  servicioId: z.string().uuid(),
  rolId: z.string().uuid().optional().or(z.literal("")),
  tipo: z.enum(["porcentaje", "monto_fijo"]),
  valor: z.string().regex(/^\d+(\.\d{1,3})?$/, "Valor inválido."),
});

export async function addComision(formData: FormData) {
  const result = commissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return;
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();

  const [servicio] = await db.select({ organizacionId: servicios.organizacionId }).from(servicios).where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId))).limit(1);
  if (!servicio) return;

  if (input.rolId) {
    const [rol] = await db
      .select({ id: catRoles.id })
      .from(catRoles)
      .where(and(eq(catRoles.id, input.rolId), eq(catRoles.organizacionId, input.organizacionId), eq(catRoles.activo, true)))
      .limit(1);
    if (!rol) return;
  }

  await db.insert(comisiones).values({
    organizacionId: input.organizacionId,
    servicioId: input.servicioId,
    rolId: input.rolId || null,
    tipo: input.tipo,
    valor: input.valor,
    createdBy: user.id,
  });
  revalidatePath("/admin/servicios");
}

export async function removeComision(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const comisionId = String(formData.get("comisionId") ?? "");
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(comisiones).set({ activo: false, updatedBy: user.id }).where(and(eq(comisiones.id, comisionId), eq(comisiones.organizacionId, organizationId)));
  revalidatePath("/admin/servicios");
}
