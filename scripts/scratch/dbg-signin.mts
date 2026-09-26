import "dotenv/config";
import { createAuth } from "@/lib/auth/server";
import { getDatabase } from "@/db/client";
import { account, user } from "@/db/schema/auth";
import { and, eq } from "drizzle-orm";
const password = "Debug!1234";
const auth = createAuth();
const ctx = await (auth as unknown as { $context: Promise<{ password: { hash: (p: string) => Promise<string>; verify: (d: {hash:string;password:string}) => Promise<boolean> } }> }).$context;
const hash = await ctx.password.hash(password);
const db = getDatabase();
const [u] = await db.select().from(user).where(eq(user.email, "e2e-salon@test.dev")).limit(1);
await db.update(account).set({ password: hash }).where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
const [acc] = await db.select({ pw: account.password }).from(account).where(eq(account.userId, u.id));
console.log("verify local:", await ctx.password.verify({ hash: acc.pw!, password }));
const res = await fetch("http://localhost:3000/api/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
  body: JSON.stringify({ email: "e2e-salon@test.dev", password }),
});
console.log("status:", res.status, await res.text());
process.exit(0);
