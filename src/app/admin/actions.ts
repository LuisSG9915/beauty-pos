"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { and, eq, inArray } from "drizzle-orm";
import { catPermisos, catRoles, invitacionesUsuarios, relRolesPermisos } from "@/db/schema/access";
import { organizaciones, sucursales } from "@/db/schema/core";
import { defaultPermissions, defaultRoles } from "@/lib/auth/defaults";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { sendAuthEmail } from "@/lib/email/auth-email";
import { getRuntimeEnv } from "@/lib/runtime-env";

const organizationSchema = z.object({
  nombre: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa solo letras, números y guiones."),
  sucursalNombre: z.string().trim().min(2).max(160),
  sucursalClave: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
});

export type OrganizationActionState = {
  error?: string;
  success?: boolean;
};

export async function createOrganization(
  _previousState: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const { user } = await requirePlatformAdmin();
  const result = organizationSchema.safeParse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
    sucursalNombre: formData.get("sucursalNombre"),
    sucursalClave: formData.get("sucursalClave"),
  });

  if (!result.success) {
    return {
      error: result.error.issues[0]?.message ?? "Revisa los datos del formulario.",
    };
  }

  try {
    const db = getDatabase();
    await db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizaciones)
        .values({
          nombre: result.data.nombre,
          slug: result.data.slug,
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning({ id: organizaciones.id });

      if (!organization) {
        throw new Error("No se pudo crear la organización.");
      }

      await tx.insert(sucursales).values({
        organizacionId: organization.id,
        nombre: result.data.sucursalNombre,
        clave: result.data.sucursalClave,
        createdBy: user.id,
        updatedBy: user.id,
      });

      await tx
        .insert(catPermisos)
        .values([...defaultPermissions])
        .onConflictDoNothing({ target: catPermisos.clave });

      const permissions = await tx
        .select({ id: catPermisos.id, clave: catPermisos.clave })
        .from(catPermisos)
        .where(inArray(catPermisos.clave, defaultPermissions.map((permission) => permission.clave)));
      const permissionIds = new Map(permissions.map((permission) => [permission.clave, permission.id]));

      const roles = await tx
        .insert(catRoles)
        .values(
          defaultRoles.map((role) => ({
            organizacionId: organization.id,
            clave: role.clave,
            nombre: role.nombre,
            alcance: "organizacion",
            esSistema: true,
          })),
        )
        .returning({ id: catRoles.id, clave: catRoles.clave });

      const rolePermissionRows = roles.flatMap((role) =>
        defaultRoles
          .find((defaultRole) => defaultRole.clave === role.clave)
          ?.permissions.flatMap((permission) => {
            const permisoId = permissionIds.get(permission);
            return permisoId ? [{ rolId: role.id, permisoId }] : [];
          }) ?? [],
      );

      if (rolePermissionRows.length > 0) {
        await tx.insert(relRolesPermisos).values(rolePermissionRows);
      }
    });
  } catch {
    return {
      error: "No se pudo crear la organización. Verifica que el identificador no esté repetido.",
    };
  }

  revalidatePath("/admin");
  return { success: true };
}

const invitationSchema = z.object({
  organizacionId: z.string().uuid(),
  rolId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  nombre: z.string().trim().min(2).max(160),
  correo: z.string().trim().toLowerCase().email().max(254),
});

export type InvitationActionState = {
  error?: string;
  success?: boolean;
  invitationUrl?: string;
};

async function hashInvitationToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createInvitation(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const { user } = await requirePlatformAdmin();
  const result = invitationSchema.safeParse({
    organizacionId: formData.get("organizacionId"),
    rolId: formData.get("rolId"),
    sucursalId: formData.get("sucursalId"),
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Revisa los datos de la invitación." };
  }

  let localInvitationUrl: string | undefined;

  try {
    const db = getDatabase();
    const [role] = await db
      .select({ id: catRoles.id })
      .from(catRoles)
      .where(and(eq(catRoles.id, result.data.rolId), eq(catRoles.organizacionId, result.data.organizacionId)))
      .limit(1);
    const [branch] = await db
      .select({ id: sucursales.id })
      .from(sucursales)
      .where(and(eq(sucursales.id, result.data.sucursalId), eq(sucursales.organizacionId, result.data.organizacionId)))
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

    if (useLocalInvitationLink) {
      localInvitationUrl = invitationUrl;
    } else {
      await sendAuthEmail({
        to: result.data.correo,
        subject: "Invitación a Beauty POS",
        title: `Hola ${result.data.nombre}, tienes una invitación a Beauty POS`,
        url: invitationUrl,
      });
    }

    await db.insert(invitacionesUsuarios).values({
      organizacionId: result.data.organizacionId,
      rolId: result.data.rolId,
      sucursalId: result.data.sucursalId,
      correo: result.data.correo,
      nombre: result.data.nombre,
      tokenHash,
      expiraAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: user.id,
    });
  } catch {
    return { error: "No se pudo enviar la invitación. Verifica la configuración de correo." };
  }

  revalidatePath("/admin");
  return { success: true, invitationUrl: localInvitationUrl };
}
