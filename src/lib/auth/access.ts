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

// Sesión para route handlers: devuelve el usuario interno o `null` sin
// redirigir (el endpoint decide el status: 401/403/404). A diferencia de
// `requireAuthenticatedUser`, pensada para respuestas no-HTML (JSON, blobs)
// donde un redirect a /login sería incorrecto.
export const getApiSessionUser = cache(async () => {
  const session = await createAuth().api.getSession({
    headers: await headers(),
  });
  if (!session) return null;

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
    .where(eq(usuarios.authUsuarioId, session.user.id))
    .limit(1);

  return user ?? null;
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

export const RUTAS_PUBLICAS_PREFIJOS = [
  "/precios",
  "/registro",
  "/reservar",
  "/mi-cita",
  "/invitacion",
  "/privacidad",
  "/terminos",
  "/soporte",
  "/login",
  "/recuperar",
  "/restablecer",
  "/offline",
  "/api/health",
  "/api/auth",
  "/_next",
] as const;

export const RUTAS_PUBLICAS_EXACTAS = [
  "/",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
  "/robots.txt",
  "/icon.png",
  "/icon.svg",
  "/apple-icon.png",
  "/og.png",
] as const;

export const RUTAS_PUBLICAS_ACCESS = [
  ...RUTAS_PUBLICAS_EXACTAS,
  ...RUTAS_PUBLICAS_PREFIJOS,
] as const;

/**
 * Determina si una ruta es pública y debe omitir cualquier verificación
 * o redirección de Cloudflare Access (Zero Trust).
 */
export function esRutaPublicaAccess(pathname: string): boolean {
  if ((RUTAS_PUBLICAS_EXACTAS as readonly string[]).includes(pathname)) {
    return true;
  }
  if (pathname.startsWith("/icon") || pathname.startsWith("/apple-icon")) {
    return true;
  }
  for (const prefijo of RUTAS_PUBLICAS_PREFIJOS) {
    if (pathname === prefijo || pathname.startsWith(`${prefijo}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Validador de Access que retorna acceso permitido inmediatamente si la ruta es pública.
 */
export function validarAccesoRuta(pathname: string, hasAssertion = false): boolean {
  if (esRutaPublicaAccess(pathname)) {
    return true;
  }
  return hasAssertion;
}

