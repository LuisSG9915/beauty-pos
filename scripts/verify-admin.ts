import "dotenv/config";

import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { user as authUsers } from "@/db/schema/auth";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    throw new Error("Define BOOTSTRAP_ADMIN_EMAIL para continuar.");
  }

  const db = getDatabase();
  const existingUser = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);

  if (existingUser.length === 0) {
    throw new Error("No existe un usuario de autenticación con ese correo.");
  }

  await db
    .update(authUsers)
    .set({ emailVerified: true })
    .where(eq(authUsers.id, existingUser[0].id));

  console.log(`Correo verificado para: ${email}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo verificar el correo.");
  process.exitCode = 1;
});
