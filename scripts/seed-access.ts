import "dotenv/config";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relRolesPermisos } from "@/db/schema/access";
import { organizaciones } from "@/db/schema/core";
import { defaultPermissions, defaultRoles } from "@/lib/auth/defaults";
import { RUTAS_PUBLICAS_ACCESS } from "@/lib/auth/access";

/**
 * Definición declarativa de la aplicación y políticas de Cloudflare Access (Zero Trust).
 * Protege exclusivamente melena.app/admin* y crea un bypass explícito (precedencia 1)
 * para todas las rutas públicas.
 */
export const cloudflareAccessConfig = {
  application: {
    domain: "melena.app/admin*",
    name: "Melena Admin",
    type: "self_hosted",
    sessionDuration: "24h",
  },
  policies: [
    {
      name: "Bypass Rutas Públicas",
      precedence: 1,
      decision: "bypass" as const,
      include: [{ everyone: {} }],
      paths: [...RUTAS_PUBLICAS_ACCESS],
    },
    {
      name: "Acceso Exclusivo Administradores",
      precedence: 2,
      decision: "allow" as const,
      include: [{ email_domain: { domain: "melena.app" } }],
      paths: ["/admin", "/admin/*"],
    },
  ],
};

async function main() {
  const db = getDatabase();
  const organizations = await db.select({ id: organizaciones.id, nombre: organizaciones.nombre }).from(organizaciones);

  for (const organization of organizations) {
    await db.transaction(async (tx) => {
      await tx.insert(catPermisos).values([...defaultPermissions]).onConflictDoNothing({ target: catPermisos.clave });
      const permissions = await tx
        .select({ id: catPermisos.id, clave: catPermisos.clave })
        .from(catPermisos)
        .where(inArray(catPermisos.clave, defaultPermissions.map((permission) => permission.clave)));
      const permissionIds = new Map(permissions.map((permission) => [permission.clave, permission.id]));

      await tx
        .insert(catRoles)
        .values(defaultRoles.map((role) => ({ organizacionId: organization.id, clave: role.clave, nombre: role.nombre, alcance: "organizacion", esSistema: true })))
        .onConflictDoNothing();
      const roles = await tx
        .select({ id: catRoles.id, clave: catRoles.clave })
        .from(catRoles)
        .where(eq(catRoles.organizacionId, organization.id));

      const relationRows = roles.flatMap((role) => {
        const defaultRole = defaultRoles.find((item) => item.clave === role.clave);
        return defaultRole?.permissions.flatMap((permission) => {
          const permisoId = permissionIds.get(permission);
          return permisoId ? [{ rolId: role.id, permisoId }] : [];
        }) ?? [];
      });

      if (relationRows.length > 0) {
        await tx.insert(relRolesPermisos).values(relationRows).onConflictDoNothing();
      }
    });
    console.log(`Acceso sincronizado: ${organization.nombre}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo sincronizar el acceso.");
  process.exitCode = 1;
});
