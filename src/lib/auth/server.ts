import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins";

import { getDatabase, getRequestScope } from "@/db/client";
import {
  account,
  session,
  twoFactor as twoFactorTable,
  user,
  verification,
} from "@/db/schema/auth";
import { sendAuthEmail } from "@/lib/email/auth-email";
import { getRuntimeEnv } from "@/lib/runtime-env";

type AuthOptions = {
  allowSignUp?: boolean;
  sendEmails?: boolean;
};

type AuthInstance = ReturnType<typeof betterAuth>;

// La configuración es estática por proceso; reutilizar la instancia evita
// reconstruir el adaptador y los plugins en cada request. En Workers el
// adaptador captura la conexión del request que la creó, así que la caché
// debe ser por request: una instancia global usaría un pool ya cerrado.
const authInstances = new Map<string, AuthInstance>();
const requestAuthInstances = new WeakMap<object, Map<string, AuthInstance>>();

export function createAuth({ allowSignUp = false, sendEmails = true }: AuthOptions = {}) {
  const env = getRuntimeEnv();
  const secret = env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
  }

  const key = `${allowSignUp}:${sendEmails}`;
  const scope = getRequestScope();
  const store = scope
    ? (requestAuthInstances.get(scope) ?? new Map<string, AuthInstance>())
    : authInstances;
  const cached = store.get(key);
  if (cached) return cached;

  const instance = betterAuth({
    secret,
    database: drizzleAdapter(getDatabase(), {
      provider: "pg",
      schema: { account, session, twoFactor: twoFactorTable, user, verification },
      schemaName: "auth",
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
      requireEmailVerification: !allowSignUp,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Restablece tu contraseña de Beauty POS",
          title: "Restablece tu contraseña",
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: sendEmails,
      sendOnSignIn: sendEmails,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail({
          to: user.email,
          subject: "Verifica tu correo de Beauty POS",
          title: "Verifica tu correo",
          url,
        });
      },
    },
    plugins: [
      twoFactorPlugin({
        issuer: "Beauty POS",
      }),
      nextCookies(),
    ],
    advanced: {
      // En Cloudflare la IP real del cliente llega en cf-connecting-ip (la
      // cabecera la fija el edge, no es falsificable por el cliente). El
      // fallback cubre despliegues tras otros proxies y desarrollo local.
      // Sin IP el rate limiter cae a un bucket compartido para toda la app.
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
      },
    },
    // Rate limiting activo solo en producción (default de better-auth):
    // sign-in/sign-up/change-password → 3 req / 10 s por IP+path;
    // reset y verificación por correo → 3 / 60 s; resto → 100 / 10 s.
    rateLimit: {
      storage: "memory",
    },
  } as BetterAuthOptions);

  store.set(key, instance);
  if (scope) requestAuthInstances.set(scope, store);
  return instance;
}
