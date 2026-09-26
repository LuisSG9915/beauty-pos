import "dotenv/config";
import { Client } from "pg";
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(`update citas set activo=false where organizacion_id=$1 and notas ilike 'E2E-STALE%'`, ["652c172c-bf32-4b9c-90d1-006eded7ff56"]);
  console.log("residuos E2E-STALE desactivados");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
