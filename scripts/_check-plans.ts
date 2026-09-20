import "dotenv/config";
import { getDatabase } from "@/db/client";
import { planes } from "@/db/schema/billing";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDatabase();
  const [pro] = await db.select().from(planes).where(eq(planes.clave, "pro"));
  console.log(JSON.stringify(pro, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
