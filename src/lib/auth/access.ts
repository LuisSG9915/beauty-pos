import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, usuarios } from "@/db/schema/core";
import { createAuth } from "@/lib/auth/server";

// Piezas cacheadas por request: la sesión vive en cookie firmada
// (cookieCache) y casi nunca toca la BD; el usuario se consulta una sola vez
// y se comparte entre layout y página.
export const getSessionOrRedirect = cache(async () => {
  const session = await createAuth().api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return session;
});

export const getUsuarioByAuthId = cache(async (authUsuarioId: string) => {
  const db = getDatabase();
  const [user] = await db
    .select({
      id: usuarios.id,
      authUsuarioId: usuarios.authUsuarioId,
      nombre: usuarios.nombre,
      correo: usuarios.correo,
      esAdministradorPlataforma: usuarios.esAdministradorPlataforma,
    })
    .from(usuarios)
    .where(eq(usuarios.authUsuarioId, authUsuarioId))
    .limit(1);

  if (!user) {
    redirect("/login?error=account-not-configured");
  }

  return user;
});

// React.cache deduplica por render (request): el layout y la página comparten
// la misma resolución de sesión+usuario en lugar de repetir las consultas.
export const requireAuthenticatedUser = cache(async () => {
  const session = await getSessionOrRedirect();
  const user = await getUsuarioByAuthId(session.user.id);

  return { session, user };
});

// Membresía activa (org, usuario) → id; compartida por request entre el guard
// y la resolución de acceso para no repetir la consulta.
export const getMembershipId = cache(
  async (organizationId: string, userId: string): Promise<string | null> => {
    const db = getDatabase();
    const [membership] = await db
      .select({ id: miembrosOrganizaciones.id })
      .from(miembrosOrganizaciones)
      .where(
        and(
          eq(miembrosOrganizaciones.organizacionId, organizationId),
          eq(miembrosOrganizaciones.usuarioId, userId),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      )
      .limit(1);
    return membership?.id ?? null;
  },
);

export async function requireOrganizationAccess(organizationId: string) {
  const result = await requireAuthenticatedUser();

  if (result.user.esAdministradorPlataforma) {
    return result;
  }

  const membershipId = await getMembershipId(organizationId, result.user.id);

  if (!membershipId) {
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
