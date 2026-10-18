"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { user as authUsers } from "@/db/schema/auth";
import { organizaciones } from "@/db/schema/core";
import { telemetriaEventos } from "@/db/schema/telemetry";
import { createAuth } from "@/lib/auth/server";
import { getClientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { verificarTurnstileToken } from "@/lib/turnstile";
import { provisionarOrganizacionTrial } from "@/modules/billing/service";

const registroSchema = z.object({
  negocio: z.string().trim().min(2, "Escribe el nombre de tu negocio.").max(160),
  nombre: z.string().trim().min(2, "Escribe tu nombre.").max(160),
  correo: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
  password: z.string().min(12, "La contraseña necesita al menos 12 caracteres."),
});

export type RegistroState = { error?: string; ok?: boolean; verificacionPendiente?: boolean };

/** Slug base del negocio; si ya existe se le agrega un sufijo numérico. */
async function slugDisponible(nombre: string): Promise<string> {
  const base =
    nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "negocio";

  const db = getDatabase();
  for (let i = 0; i < 20; i += 1) {
    const candidato = i === 0 ? base : `${base}-${i + 1}`;
    const [existe] = await db
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.slug, candidato))
      .limit(1);
    if (!existe) return candidato;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Registro self-service: crea la cuenta de acceso (better-auth) y provisiona
 * la organización completa con trial de 14 días. Con el correo configurado se
 * envía la verificación real y la cuenta queda sin verificar hasta que la
 * persona siga el enlace; sin Brevo (solo desarrollo local) se auto-verifica.
 * Si la provisión falla se borra el usuario de auth para que pueda reintentar
 * con el mismo correo.
 */
export async function registrarNegocio(
  _previousState: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const headerList = await headers();
  const ip = getClientIp(headerList);

  const rateLimit = await checkRateLimit("registro:" + ip, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rateLimit.success) {
    return { error: "Demasiados intentos de registro. Espera unos minutos antes de intentar de nuevo." };
  }

  const turnstileToken = formData.get("cf-turnstile-response") as string | null;
  const turnstileValido = await verificarTurnstileToken(turnstileToken, ip);
  if (!turnstileValido) {
    return { error: "Verificación de seguridad fallida. Por favor, inténtalo de nuevo." };
  }

  const input = registroSchema.safeParse({
    negocio: formData.get("negocio"),
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
    password: formData.get("password"),
  });
  if (!input.success) {
    return { error: input.error.issues[0]?.message ?? "Revisa los datos del formulario." };
  }

  const db = getDatabase();
  const [correoEnUso] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, input.data.correo))
    .limit(1);
  if (correoEnUso) {
    return { error: "Ese correo ya tiene una cuenta. Inicia sesión para continuar." };
  }

  const env = getRuntimeEnv();
  const correoConfigurado = Boolean(env.BREVO_API_KEY && env.BREVO_FROM_EMAIL);
  const auth = createAuth({ allowSignUp: true, sendEmails: correoConfigurado });
  let result;
  try {
    result = await auth.api.signUpEmail({
      body: { email: input.data.correo, name: input.data.nombre, password: input.data.password },
    });
  } catch (error) {
    console.error("registrarNegocio signUp", error);
    // Si el envío del correo falló después de crear el usuario, se libera el
    // correo para que el registro pueda reintentarse.
    const [huérfano] = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, input.data.correo))
      .limit(1);
    if (huérfano) await db.delete(authUsers).where(eq(authUsers.id, huérfano.id));
    return { error: "No pudimos enviar el correo de verificación. Inténtalo de nuevo en unos minutos." };
  }
  if (!("user" in result)) {
    return { error: "No se pudo crear tu cuenta. Es posible que el correo ya esté registrado." };
  }

  if (!correoConfigurado) {
    await db.update(authUsers).set({ emailVerified: true }).where(eq(authUsers.id, result.user.id));
  }

  const slug = await slugDisponible(input.data.negocio);
  // La primera sucursal nace con el nombre del negocio (no el genérico
  // "Sucursal principal"): en el alta por invitación no hay paso para
  // nombrarla y el nombre del salón ya identifica el lugar.
  const provision = await provisionarOrganizacionTrial({
    nombreNegocio: input.data.negocio,
    slug,
    sucursalNombre: input.data.negocio,
    authUsuarioId: result.user.id,
    usuarioNombre: input.data.nombre,
    correo: input.data.correo,
  });

  if (!provision.ok) {
    // Revierte la cuenta de auth para que el correo quede libre al reintentar.
    try {
      await db.delete(authUsers).where(eq(authUsers.id, result.user.id));
    } catch {
      // Si no se pudo borrar, queda una cuenta sin organización; el mensaje
      // sigue siendo válido y se puede limpiar manualmente.
    }
    return { error: provision.error };
  }

  // Telemetría de adquisición: atribuye el registro a la visita que trajo a
  // la persona (cookie anónima bp_vid). Nunca rompe el registro si falla.
  try {
    const cookieStore = await cookies();
    const vid = cookieStore.get("bp_vid")?.value ?? null;
    await db.insert(telemetriaEventos).values({
      vid,
      tipo: "registro_completado",
      origen: "registro",
    });
  } catch (error) {
    console.error("registrarNegocio telemetria", error);
  }

  return { ok: true, verificacionPendiente: correoConfigurado };
}

export const registrarSalonAction = registrarNegocio;
