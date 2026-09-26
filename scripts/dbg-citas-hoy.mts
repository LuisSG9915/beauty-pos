import "dotenv/config";
import { getDatabase } from "@/db/client";
import { citas } from "@/db/schema/operations";
import { desc } from "drizzle-orm";
const db = getDatabase();
const rows = await db
  .select({ fechaHora: citas.fechaHora, estado: citas.estado })
  .from(citas)
  .orderBy(desc(citas.fechaHora))
  .limit(15);
for (const r of rows) console.log(r.fechaHora.toISOString(), r.estado);
process.exit(0);
