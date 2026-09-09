"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

export async function addServicioInsumo(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const servicioId = String(formData.get("servicioId") ?? "");
  const productoId = String(formData.get("productoId") ?? "");
  const cantidadStr = String(formData.get("cantidad") ?? "0");

  const cantidadSchema = z.string().regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida.");
  const cantidadResult = cantidadSchema.safeParse(cantidadStr);
  if (!cantidadResult.success) return;

  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();

  const [servicio] = await db.select({ organizacionId: servicios.organizacionId }).from(servicios).where(and(eq(servicios.id, servicioId), eq(servicios.organizacionId, organizationId))).limit(1);
  if (!servicio) return;

  const [producto] = await db.select({ id: productos.id, tipo: productos.tipo }).from(productos).where(and(eq(productos.id, productoId), eq(productos.organizacionId, organizationId))).limit(1);
  if (!producto) return;
  if (producto.tipo !== "insumo" && producto.tipo !== "ambos") return;

  const existing = await db.select({ id: relServiciosInsumos.id }).from(relServiciosInsumos).where(and(eq(relServiciosInsumos.servicioId, servicioId), eq(relServiciosInsumos.productoId, productoId))).limit(1);
  if (existing.length > 0) {
    await db.update(relServiciosInsumos).set({ cantidad: cantidadStr, activo: true, updatedBy: user.id }).where(eq(relServiciosInsumos.id, existing[0].id));
  } else {
    await db.insert(relServiciosInsumos).values({ organizacionId: organizationId, servicioId, productoId, cantidad: cantidadStr, createdBy: user.id });
  }
  revalidatePath("/admin/servicios");
}

export async function removeServicioInsumo(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const insumoRelId = String(formData.get("insumoRelId") ?? "");

  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(relServiciosInsumos).set({ activo: false, updatedBy: user.id }).where(and(eq(relServiciosInsumos.id, insumoRelId), eq(relServiciosInsumos.organizacionId, organizationId)));
  revalidatePath("/admin/servicios");
}
