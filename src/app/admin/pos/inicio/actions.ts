"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones } from "@/db/schema/core";
import { buildAdminHref } from "@/lib/url-context";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { guardarConfiguracionesPos } from "@/modules/pos/queries";

const schema = z.object({
  organizacionId: z.string().uuid(),
  valores: z.record(z.string(), z.boolean()),
});

/**
 * Guarda la selección de características del POS para una organización.
 * Solo el miembro activo de la organización puede modificarla.
 * Navega (redirect) al POS tras guardar, o de vuelta a la selección con un
 * aviso de error cuando algo falla.
 */
export async function guardarSeleccionCaracteristicasPos(
  formData: FormData,
): Promise<void> {
  let valores: Record<string, boolean>;
  try {
    valores = JSON.parse(String(formData.get("valores") ?? "{}"));
  } catch {
    redirect(
      buildAdminHref("/pos/inicio", {
        organizationId: String(formData.get("organizacionId")),
        extra: { error: "seleccion-invalida" },
      }),
    );
    return;
  }

  const parsed = schema.safeParse({
    organizacionId: formData.get("organizacionId"),
    valores,
  });
  if (!parsed.success) {
    redirect(
      buildAdminHref("/pos/inicio", {
        organizationId: String(formData.get("organizacionId")),
        extra: { error: "seleccion-invalida" },
      }),
    );
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
    redirect(
      buildAdminHref("/pos/inicio", {
        organizationId: organizacionId,
        extra: { error: "no-acceso" },
      }),
    );
    return;
  }

  await guardarConfiguracionesPos(
    organizacionId,
    valores as Record<string, boolean>,
  );

  redirect(buildAdminHref("/pos", { organizationId: organizacionId, extra: { nueva: "1" } }));
}
