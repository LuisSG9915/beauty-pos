import "dotenv/config";
import { getDatabase } from "@/db/client";
import { user } from "@/db/schema/auth";

async function main() {
  const db = getDatabase();
  const us = await db.select().from(user);
  for (const u of us) console.log(`${u.email} | verified=${u.emailVerified} | ${u.name}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
