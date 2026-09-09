"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { comisiones, servicios } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

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
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();

  const [servicio] = await db.select({ organizacionId: servicios.organizacionId }).from(servicios).where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId))).limit(1);
  if (!servicio) return;

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
  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(comisiones).set({ activo: false, updatedBy: user.id }).where(and(eq(comisiones.id, comisionId), eq(comisiones.organizacionId, organizationId)));
  revalidatePath("/admin/servicios");
}
