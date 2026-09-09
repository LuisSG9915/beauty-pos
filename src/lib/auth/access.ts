import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, usuarios } from "@/db/schema/core";
import { createAuth } from "@/lib/auth/server";

export async function requireAuthenticatedUser() {
  const session = await createAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const db = getDatabase();
  const [user] = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      correo: usuarios.correo,
      esAdministradorPlataforma: usuarios.esAdministradorPlataforma,
    })
    .from(usuarios)
    .where(eq(usuarios.authUsuarioId, session.user.id))
    .limit(1);

  if (!user) {
    redirect("/login?error=account-not-configured");
  }

  return { session, user };
}

export async function requireOrganizationAccess(organizationId: string) {
  const result = await requireAuthenticatedUser();

  if (result.user.esAdministradorPlataforma) {
    return result;
  }

  const db = getDatabase();
  const [membership] = await db
    .select({ id: miembrosOrganizaciones.id })
    .from(miembrosOrganizaciones)
    .where(
      and(
        eq(miembrosOrganizaciones.organizacionId, organizationId),
        eq(miembrosOrganizaciones.usuarioId, result.user.id),
        eq(miembrosOrganizaciones.estado, "activo"),
      ),
    )
    .limit(1);

  if (!membership) {
    redirect("/admin?error=organization-access-denied");
  }

  return result;
}

export async function requirePlatformAdmin() {
  const result = await requireAuthenticatedUser();

  if (!result.user.esAdministradorPlataforma) {
    redirect("/login?error=access-denied");
  }

  return result;
}
