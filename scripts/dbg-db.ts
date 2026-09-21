import "dotenv/config";
import pg from "pg";
async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const vid = "5a1eb3f6-693c-4acd-8669-ccefb19dd11b";
  const s = await c.query("SELECT nombre, cantidad, activo, updated_at FROM detalle_ventas_servicios WHERE venta_id=$1 ORDER BY updated_at", [vid]);
  console.table(s.rows);
  const p = await c.query("SELECT nombre, cantidad, activo, updated_at FROM detalle_ventas_productos WHERE venta_id=$1", [vid]);
  console.table(p.rows);
  const v = await c.query("SELECT estado, total::text, updated_at FROM ventas WHERE id=$1", [vid]);
  console.table(v.rows);
  await c.end();
}
main();
