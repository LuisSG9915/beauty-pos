import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { account, user } from "@/db/schema/auth";
const db = getDatabase();
const [u] = await db.select().from(user).where(eq(user.email, "e2e-salon@test.dev")).limit(1);
console.log("user:", u ? { id: u.id, email: u.email, emailVerified: u.emailVerified } : null);
if (u) {
  const accs = await db.select({ providerId: account.providerId, hasPw: account.password }).from(account).where(eq(account.userId, u.id));
  console.log("accounts:", accs.map(a => ({ p: a.providerId, pw: a.hasPw ? "set" : "null" })));
}
process.exit(0);
