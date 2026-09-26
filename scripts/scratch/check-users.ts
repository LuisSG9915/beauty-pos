import "dotenv/config";

import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";

async function main() {
  const db = getDatabase();
  const r = await db.execute(
    sql`select correo from usuarios order by correo`,
  );
  console.log(r.rows);
  process.exit(0);
}

main();
