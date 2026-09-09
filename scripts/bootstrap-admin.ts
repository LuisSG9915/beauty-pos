import "dotenv/config";

import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { user as authUsers } from "@/db/schema/auth";
import { usuarios } from "@/db/schema/core";
import { createAuth } from "@/lib/auth/server";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();

  if (!email || !password || !name) {
    throw new Error(
      "Define BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD y BOOTSTRAP_ADMIN_NAME para continuar.",
    );
  }

  if (password.length < 12) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 12 caracteres.");
  }

  const db = getDatabase();
  const existingUser = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.correo, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("Ya existe un usuario del POS con ese correo.");
  }

  const auth = createAuth({ allowSignUp: true, sendEmails: false });
  const result = await auth.api.signUpEmail({
    body: {
      email,
      name,
      password,
    },
  });

  if (!("user" in result)) {
    throw new Error("No se pudo crear el usuario de autenticación.");
  }

  await db
    .update(authUsers)
    .set({ emailVerified: true })
    .where(eq(authUsers.id, result.user.id));

  await db.insert(usuarios).values({
    authUsuarioId: result.user.id,
    nombre: name,
    correo: email,
    esAdministradorPlataforma: true,
  });

  console.log(`Administrador de plataforma creado: ${email}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo completar el bootstrap.");
  process.exitCode = 1;
});
