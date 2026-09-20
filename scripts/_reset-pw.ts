import "dotenv/config";
import { getDatabase } from "@/db/client";
import { user, account } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const db = getDatabase();
  const [u] = await db.select().from(user).where(eq(user.email, "luis.sg9915@gmail.com"));
  if (!u) { console.log("no encontrado"); process.exit(1); }
  const hash = await hashPassword("AdminLuis#2026");
  const updated = await db.update(account).set({ password: hash }).where(eq(account.userId, u.id)).returning({ id: account.id });
  console.log("ok:", JSON.stringify(updated));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
