import "dotenv/config";
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rowCount } = await c.query(
  `update horarios_sucursales set activo = true
   where organizacion_id='652c172c-bf32-4b9c-90d1-006eded7ff56' and dia_semana=1 and activo=false`,
);
console.log("reactivados:", rowCount);
await c.end();
