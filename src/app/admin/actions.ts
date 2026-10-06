"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { inArray } from "drizzle-orm";
import { catPermisos, catRoles, relRolesPermisos } from "@/db/schema/access";
import { organizaciones, sucursales } from "@/db/schema/core";
import { defaultPermissions, defaultRoles } from "@/lib/auth/defaults";
import { requireAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/access";
import { assertBranchScope, resolveAccessSafe } from "@/lib/auth/authorization";
import { claveDisponible } from "@/lib/clave";
import { issueInvitation } from "@/lib/invitations";
import { escribirSucursalCookie } from "@/lib/sucursal-cookie";

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
    .regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.")
    .optional()
    .or(z.literal("")),
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

      // Clave opcional: vacía se genera del nombre de la sucursal (org
      // recién creada, siempre hay hueco; el único la respalda).
      const clave =
        result.data.sucursalClave ||
        (await claveDisponible(tx, sucursales, organization.id, result.data.sucursalNombre, 40));
      await tx.insert(sucursales).values({
        organizacionId: organization.id,
        nombre: result.data.sucursalNombre,
        clave,
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

  try {
    const issued = await issueInvitation({ ...result.data, createdBy: user.id });
    if (issued.error) return { error: issued.error };
    revalidatePath("/admin");
    return { success: true, invitationUrl: issued.invitationUrl };
  } catch {
    return { error: "No se pudo enviar la invitación. Verifica la configuración de correo." };
  }
}

const sucursalPreferidaSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  returnTo: z.string().trim().max(600).optional(),
});

/**
 * Conserva solo rutas internas del panel ("/admin" o "/admin/...", con query
 * opcional); cualquier otra cosa cae al inicio del panel.
 */
function safeAdminReturnTo(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  const path = raw.split("?")[0]?.split("#")[0] ?? "";
  if (path === "/admin" || path.startsWith("/admin/")) return raw;
  return "/admin";
}

/**
 * Persiste la sucursal preferida del usuario en la cookie httpOnly
 * `melena_sucursal_{organizacionId}` y redirige a la misma pantalla con
 * `?sucursalId` actualizado, para que el contexto se resuelva de inmediato.
 *
 * La cookie solo se escribe cuando la sucursal existe, está activa y cae
 * dentro del alcance del usuario (`assertBranchScope`): el formData nunca se
 * confía. Si la validación falla se redirige sin el parámetro y la resolución
 * normal del contexto (cookie → primera del alcance) toma el control.
 */
export async function guardarSucursalPreferida(formData: FormData): Promise<void> {
  const parsed = sucursalPreferidaSchema.safeParse({
    organizacionId: formData.get("organizacionId"),
    sucursalId: formData.get("sucursalId"),
    returnTo: formData.get("returnTo") ?? undefined,
  });
  if (!parsed.success) redirect("/admin");
  const input = parsed.data;
  const returnTo = safeAdminReturnTo(input.returnTo);

  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(input.organizacionId, user);
  const valida = access ? await assertBranchScope(access, input.sucursalId) : false;
  if (valida) {
    await escribirSucursalCookie(input.organizacionId, input.sucursalId);
  }

  const qIndex = returnTo.indexOf("?");
  const path = qIndex === -1 ? returnTo : returnTo.slice(0, qIndex);
  const search = new URLSearchParams(qIndex === -1 ? "" : returnTo.slice(qIndex + 1));
  search.set("organizationId", input.organizacionId);
  if (valida) {
    search.set("sucursalId", input.sucursalId);
  } else {
    search.delete("sucursalId");
  }
  const query = search.toString();
  redirect(`${path}${query ? `?${query}` : ""}`);
}
