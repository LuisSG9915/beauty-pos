import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catRoles, invitacionesUsuarios } from "@/db/schema/access";
import { organizaciones, sucursales } from "@/db/schema/core";
import { sendAuthEmail } from "@/lib/email/auth-email";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { validarLimiteUsuarios } from "@/modules/billing/queries";

export type InvitationInput = {
  organizacionId: string;
  rolId: string;
  sucursalId: string;
  nombre: string;
  correo: string;
  createdBy: string;
};

async function hashInvitationToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Emite una invitación: valida que rol y sucursal pertenezcan a la
 * organización, envía el correo (o devuelve el enlace local en desarrollo)
 * y persiste el registro pendiente. No verifica permisos — eso es
 * responsabilidad del caller (platform admin o `usuarios.invitar`).
 */
export async function issueInvitation(
  input: InvitationInput,
): Promise<{ invitationUrl?: string; invitationId?: string; error?: string }> {
  const db = getDatabase();

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hashInvitationToken(token);
  const env = getRuntimeEnv();
  const baseUrl = env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const invitationUrl = `${baseUrl}/invitacion/${token}`;
  const isLocalUrl = baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1");
  const useLocalInvitationLink = env.ALLOW_DEV_INVITATION_LINK === "true" && isLocalUrl;

  // El lock de la organización serializa invitaciones concurrentes para que
  // el límite de usuarios del plan se respete siempre.
  const creada = await db.transaction(async (tx) => {
    await tx
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.id, input.organizacionId))
      .for("update");

    const [role] = await tx
      .select({ id: catRoles.id })
      .from(catRoles)
      .where(and(eq(catRoles.id, input.rolId), eq(catRoles.organizacionId, input.organizacionId), eq(catRoles.activo, true)))
      .limit(1);
    const [branch] = await tx
      .select({ id: sucursales.id })
      .from(sucursales)
      .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId), eq(sucursales.activo, true)))
      .limit(1);

    if (!role || !branch) {
      return { error: "El rol o la sucursal no pertenecen a la organización seleccionada." } as const;
    }

    const limite = await validarLimiteUsuarios(input.organizacionId, tx);
    if (!limite.ok) return { error: limite.error } as const;

    const [invitation] = await tx
      .insert(invitacionesUsuarios)
      .values({
        organizacionId: input.organizacionId,
        rolId: input.rolId,
        sucursalId: input.sucursalId,
        correo: input.correo,
        nombre: input.nombre,
        tokenHash,
        expiraAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: input.createdBy,
      })
      .returning({ id: invitacionesUsuarios.id });

    return { invitation } as const;
  });

  if ("error" in creada) return { error: creada.error };

  if (!useLocalInvitationLink) {
    try {
      await sendAuthEmail({
        to: input.correo,
        subject: "Invitación a Beauty POS",
        title: `Hola ${input.nombre}, tienes una invitación a Beauty POS`,
        url: invitationUrl,
      });
    } catch (error) {
      // Sin correo enviado la invitación quedaría inalcanzable: se revierte
      // para mantener la regla "fallo de correo = no queda invitación".
      await db.delete(invitacionesUsuarios).where(eq(invitacionesUsuarios.id, creada.invitation.id));
      throw error;
    }
  }

  return {
    invitationId: creada.invitation?.id,
    invitationUrl: useLocalInvitationLink ? invitationUrl : undefined,
  };
}
