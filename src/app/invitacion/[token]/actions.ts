"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { user as authUsers } from "@/db/schema/auth";
import { invitacionesUsuarios, relMiembrosRoles } from "@/db/schema/access";
import { miembrosOrganizaciones, relUsuariosSucursales, usuarios } from "@/db/schema/core";
import { createAuth } from "@/lib/auth/server";

const acceptSchema = z.object({
  token: z.string().min(20),
  nombre: z.string().trim().min(2).max(160),
  password: z.string().min(12),
});

export type InvitationAcceptanceState = { error?: string };

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function acceptInvitation(
  _previousState: InvitationAcceptanceState,
  formData: FormData,
): Promise<InvitationAcceptanceState> {
  const input = acceptSchema.safeParse({
    token: formData.get("token"),
    nombre: formData.get("nombre"),
    password: formData.get("password"),
  });

  if (!input.success) {
    return { error: "Completa los datos con una contraseña de al menos 12 caracteres." };
  }

  const db = getDatabase();
  const tokenHash = await hashToken(input.data.token);
  const [invitation] = await db
    .select()
    .from(invitacionesUsuarios)
    .where(and(eq(invitacionesUsuarios.tokenHash, tokenHash), eq(invitacionesUsuarios.estado, "pendiente")))
    .limit(1);

  if (!invitation || invitation.expiraAt < new Date() || !invitation.rolId || !invitation.sucursalId) {
    return { error: "La invitación no existe, expiró o ya fue utilizada." };
  }

  const auth = createAuth({ allowSignUp: true, sendEmails: false });
  const result = await auth.api.signUpEmail({
    body: { email: invitation.correo, name: input.data.nombre, password: input.data.password },
  });

  if (!("user" in result)) {
    return { error: "No se pudo crear el usuario. Es posible que el correo ya esté registrado." };
  }

  await db.update(authUsers).set({ emailVerified: true }).where(eq(authUsers.id, result.user.id));

  try {
    await db.transaction(async (tx) => {
      const [posUser] = await tx
        .insert(usuarios)
        .values({ authUsuarioId: result.user.id, nombre: input.data.nombre, correo: invitation.correo })
        .returning({ id: usuarios.id });
      if (!posUser) throw new Error("No se pudo crear el usuario del POS.");

      const [member] = await tx
        .insert(miembrosOrganizaciones)
        .values({ organizacionId: invitation.organizacionId, usuarioId: posUser.id })
        .returning({ id: miembrosOrganizaciones.id });
      if (!member) throw new Error("No se pudo asociar la organización.");

      await tx.insert(relMiembrosRoles).values({ miembroOrganizacionId: member.id, rolId: invitation.rolId! });
      await tx.insert(relUsuariosSucursales).values({
        organizacionId: invitation.organizacionId,
        usuarioId: posUser.id,
        sucursalId: invitation.sucursalId!,
      });
      await tx
        .update(invitacionesUsuarios)
        .set({ estado: "aceptada", aceptadaAt: new Date(), aceptadaPor: posUser.id })
        .where(eq(invitacionesUsuarios.id, invitation.id));
    });
  } catch {
    return { error: "No se pudo completar la asociación del usuario." };
  }

  return {};
}
