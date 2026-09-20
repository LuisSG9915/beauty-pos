import "dotenv/config";
import { getDatabase } from "@/db/client";
import { usuarios } from "@/db/schema/core";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDatabase();
  const rows = await db.select().from(usuarios).where(eq(usuarios.esAdministradorPlataforma, true));
  for (const u of rows) console.log(`${u.correo} | ${u.nombre} | platform=${u.esAdministradorPlataforma}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
