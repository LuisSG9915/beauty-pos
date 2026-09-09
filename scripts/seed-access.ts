import "dotenv/config";

import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relRolesPermisos } from "@/db/schema/access";
import { organizaciones } from "@/db/schema/core";
import { defaultPermissions, defaultRoles } from "@/lib/auth/defaults";

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
