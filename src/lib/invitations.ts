import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catRoles, invitacionesUsuarios } from "@/db/schema/access";
import { sucursales } from "@/db/schema/core";
import { sendAuthEmail } from "@/lib/email/auth-email";
import { getRuntimeEnv } from "@/lib/runtime-env";

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
  const [role] = await db
    .select({ id: catRoles.id })
    .from(catRoles)
    .where(and(eq(catRoles.id, input.rolId), eq(catRoles.organizacionId, input.organizacionId), eq(catRoles.activo, true)))
    .limit(1);
  const [branch] = await db
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId), eq(sucursales.activo, true)))
    .limit(1);

  if (!role || !branch) {
    return { error: "El rol o la sucursal no pertenecen a la organización seleccionada." };
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await hashInvitationToken(token);
  const env = getRuntimeEnv();
  const baseUrl = env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const invitationUrl = `${baseUrl}/invitacion/${token}`;
  const isLocalUrl = baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1");
  const useLocalInvitationLink = env.ALLOW_DEV_INVITATION_LINK === "true" && isLocalUrl;

  if (!useLocalInvitationLink) {
    await sendAuthEmail({
      to: input.correo,
      subject: "Invitación a Beauty POS",
      title: `Hola ${input.nombre}, tienes una invitación a Beauty POS`,
      url: invitationUrl,
    });
  }

  const [invitation] = await db
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

  return {
    invitationId: invitation?.id,
    invitationUrl: useLocalInvitationLink ? invitationUrl : undefined,
  };
}
