import "dotenv/config";
import { Client } from "pg";
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(
    `select id, to_char(fecha_hora at time zone 'America/Monterrey','HH24:MI') as hora, estado, notas, usuario_id
     from citas where organizacion_id=$1 and activo
       and (fecha_hora at time zone 'America/Monterrey')::date = '2026-09-20'
     order by fecha_hora`,
    ["652c172c-bf32-4b9c-90d1-006eded7ff56"],
  );
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
