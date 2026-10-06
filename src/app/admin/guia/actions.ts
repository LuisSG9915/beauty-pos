"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { canAccessBranch, resolveAccessSafe } from "@/lib/auth/authorization";
import { cargarEstadoNegocio } from "@/modules/onboarding/queries";
import { evaluarPasos, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";
import { registrarAccionGuia } from "@/modules/onboarding/service";

const accionGuiaSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid().optional().or(z.literal("")),
  accion: z.enum(["omitir", "reanudar", "reiniciar"]),
});

/**
 * Omitir / reanudar / reiniciar la guía de configuración. Cualquier miembro
 * activo controla su propia guía; no se requiere un permiso de módulo.
 * `pasoActual` se deriva del estado real del negocio cuando la sucursal es
 * accesible, para reanudar donde corresponde.
 */
export async function actualizarGuia(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    accionGuiaSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la acción de la guía.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(input.organizacionId, user);
  if (!access) return actionError("No tienes acceso a este negocio.");

  const db = getDatabase();
  let pasoActual = 0;
  if (input.sucursalId && input.accion !== "reiniciar" && canAccessBranch(access, input.sucursalId)) {
    const estado = await cargarEstadoNegocio(db, input.organizacionId, input.sucursalId);
    const pasos = pasosParaPermisos(access.esPlataforma ? null : access.permissions);
    pasoActual = Math.max(0, resumenGuia(evaluarPasos(pasos, estado)).siguiente);
  }

  try {
    await registrarAccionGuia(db, {
      organizacionId: input.organizacionId,
      usuarioId: user.id,
      accion: input.accion,
      pasoActual,
    });
  } catch (error) {
    console.error("actualizarGuia", error);
    return actionError("No se pudo actualizar la guía. Intenta de nuevo.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/guia");
  revalidatePath("/admin/ayuda");

  const mensajes = {
    omitir: "Guía omitida. Puedes reanudarla cuando quieras desde Ayuda.",
    reanudar: "Guía reanudada.",
    reiniciar: "Guía reiniciada.",
  };
  return actionSuccess(mensajes[input.accion]);
}
