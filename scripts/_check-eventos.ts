import "dotenv/config";
import { getDatabase } from "@/db/client";
import { billingEventos } from "@/db/schema/billing";

async function main() {
  const db = getDatabase();
  const ev = await db.select().from(billingEventos);
  for (const e of ev) console.log(`${e.tipo} | ${JSON.stringify(e.detalle)}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
