import "dotenv/config";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { account, user } from "@/db/schema/auth";
import { createAuth } from "@/lib/auth/server";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.PERF_EMAIL ?? "e2e-salon@test.dev";

async function main() {
  const password = `Bench!${randomBytes(12).toString("hex")}`;
  const auth = createAuth();
  const ctx = await (auth as unknown as {
    $context: Promise<{ password: { hash: (p: string) => Promise<string> } }>;
  }).$context;
  const hash = await ctx.password.hash(password);
  const db = getDatabase();
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, EMAIL))
    .limit(1);
  if (!target) throw new Error(`Usuario ${EMAIL} no existe`);
  await db
    .update(account)
    .set({ password: hash })
    .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));

  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${res.status}: ${await res.text()}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  const token = cookie.match(/better-auth\.session_token=([^;]+)/)?.[1];
  if (!token) throw new Error(`sin session_token en: ${cookie}`);
  console.log(token);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
