"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, sucursales } from "@/db/schema/core";
import { ventas } from "@/db/schema/operations";
import { buildAdminHref } from "@/lib/url-context";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { cobrarVenta, type CobroActionState } from "@/app/admin/pos/actions";
import { initialActionState } from "@/lib/action-state";

const schema = z.object({
  organizacionId: z.string().uuid(),
});

/**
 * Crea una venta directa (sin cita) para el cobro sencillo y redirige a la
 * página de cobro sencillo. Solo el miembro activo de la organización puede
 * crearla.
 */
export async function crearVentaSencilla(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    organizacionId: formData.get("organizacionId"),
  });
  if (!parsed.success) {
    redirect(buildAdminHref("/pos/sencillo", { extra: { error: "seleccion-invalida" } }));
    return;
  }

  const { organizacionId } = parsed.data;
  const { user } = await requireAuthenticatedUser();

  const [membresia] = await getDatabase()
    .select({ id: miembrosOrganizaciones.id })
    .from(miembrosOrganizaciones)
    .where(
      and(
        eq(miembrosOrganizaciones.organizacionId, organizacionId),
        eq(miembrosOrganizaciones.usuarioId, user.id),
      ),
    )
    .limit(1);

  if (!membresia) {
    redirect(buildAdminHref("/pos/sencillo", { organizationId: organizacionId, extra: { error: "no-acceso" } }));
    return;
  }

  const branch = await getDatabase()
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(
      and(
        eq(sucursales.organizacionId, organizacionId),
        eq(sucursales.activo, true),
      ),
    )
    .limit(1);

  const sucursalId = branch[0]?.id;
  if (!sucursalId) {
    redirect(buildAdminHref("/pos/sencillo", { organizationId: organizacionId, extra: { error: "sin-sucursal" } }));
    return;
  }

  const [venta] = await getDatabase()
    .insert(ventas)
    .values({
      organizacionId,
      sucursalId,
      estado: "en_proceso",
      createdBy: user.id,
    })
    .returning({ id: ventas.id });

  redirect(
    buildAdminHref("/pos/sencillo", {
      organizationId: organizacionId,
      sucursalId,
      extra: { ventaId: venta.id },
    }),
  );
}

/**
 * Cobra la venta directamente con los pagos ya prellenados en el formulario.
 * Wrapper alrededor de `cobrarVenta` que devuelve `void` para usarlo como
 * `action` de un `<form>` del cobro sencillo.
 */
export async function cobrarVentaSencilla(formData: FormData): Promise<void> {
  await cobrarVenta(initialActionState as CobroActionState, formData);
}
