/**
 * Smoke acotado del scaffold CFDI (sin PAC): gate de configuración, emisión
 * con timbrado stub, bloqueo de doble emisión, cancelación y re-emisión.
 * Uso: pnpm tsx scripts/facturacion-smoke.ts
 */
import puppeteer, { type Page } from "puppeteer";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Faltan BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD en .env");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const record = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (ok) passed++;
  else failed++;
};

type PgClient = import("pg").Client;
async function withDb<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const btnSel = (text: string) => `button::-p-text(${text})`;

async function clickText(page: Page, text: string) {
  try {
    await page.click(btnSel(text));
    return true;
  } catch {
    return false;
  }
}

async function hasText(page: Page, text: string, timeout = 15000) {
  try {
    await page.waitForSelector(`::-p-text(${text})`, { timeout });
    return true;
  } catch {
    return false;
  }
}

const exists = (page: Page, sel: string) => page.$(sel).then((el) => el != null);

async function main() {
  // Contexto: org del admin + una venta completada suya sin comprobante.
  const ctx = await withDb(async (c) => {
    const { rows } = await c.query(
      `with u as (
         select id, es_administrador_plataforma as plataforma from usuarios where correo = $1
       )
       select org.id as org from organizaciones org
       where (select plataforma from u)
          or exists (select 1 from miembros_organizaciones mo, u
                     where mo.organizacion_id = org.id and mo.usuario_id = u.id and mo.estado = 'activo')
       order by org.nombre limit 1`,
      [email],
    );
    const org = rows[0]?.org;
    if (!org) throw new Error("Sin organización para el admin");
    const { rows: vrows } = await c.query(
      `select v.id, v.sucursal_id, v.total from ventas v
       where v.organizacion_id = $1 and v.estado = 'completada' and v.activo
         and not exists (select 1 from comprobantes cp where cp.venta_id = v.id and cp.activo)
       order by v.created_at desc limit 1`,
      [org],
    );
    if (!vrows[0]) throw new Error("Sin venta completada disponible en la org");
    return { org, ventaId: vrows[0].id as string, sucursalId: vrows[0].sucursal_id as string, total: vrows[0].total as string };
  });
  console.log(`Org ${ctx.org} · venta ${ctx.ventaId} ($${ctx.total})`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60_000);
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  try {
    // Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
    await page.type('input[name="email"]', email!);
    await page.type('input[name="password"]', password!);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    record("Login", page.url().includes("/admin"));

    const factUrl = `${BASE_URL}/admin/facturacion?organizationId=${ctx.org}`;
    const posUrl = `${BASE_URL}/admin/pos?organizationId=${ctx.org}&sucursalId=${ctx.sucursalId}&ventaId=${ctx.ventaId}`;

    // Gate: sin config de emisor, el ticket muestra el aviso y no el botón.
    await page.goto(posUrl, { waitUntil: "networkidle0" });
    record("Ticket muestra sección Facturación", await hasText(page, "Facturación (CFDI)"));
    record("Sin emisor: gate 'Configura primero'", await hasText(page, "Configura primero los datos fiscales"));
    record("Sin emisor no hay botón Emitir", !(await exists(page, btnSel("Emitir factura"))));

    // Configurar emisor
    await page.goto(factUrl, { waitUntil: "networkidle0" });
    record("Página facturación renderiza", await hasText(page, "Datos del emisor"));
    record("Banner 'sin PAC' visible", await hasText(page, "sin PAC contratado"));
    await page.type('input[name="rfc"]', "AAA010101AAA");
    await page.type('input[name="razonSocial"]', "SALON E2E SA DE CV");
    await page.type('input[name="codigoPostal"]', "44100");
    await clickText(page, "Guardar emisor");
    record("Emisor guardado", await hasText(page, "guardados"));

    // Emitir a público en general
    await page.goto(posUrl, { waitUntil: "networkidle0" });
    record("Panel Facturación en ticket", await hasText(page, "Facturación (CFDI)"));
    await clickText(page, "Emitir factura");
    record("CFDI timbrada (stub)", await hasText(page, "Timbrada", 20000));
    record("Aviso 'sin validez SAT' visible", await hasText(page, "no tiene validez ante el SAT"));

    // DB: comprobante timbrada con folio fiscal y desglose coherente
    const db1 = await withDb(async (c) => {
      const { rows } = await c.query(
        `select estado, uuid, pac_proveedor, folio, subtotal, impuestos, total, receptor_rfc, receptor_cp
         from comprobantes where venta_id = $1 and activo order by created_at desc limit 1`,
        [ctx.ventaId],
      );
      return rows[0] ?? null;
    });
    record(
      "DB: timbrada + uuid + stub",
      db1?.estado === "timbrada" &&
        typeof db1.uuid === "string" &&
        db1.uuid.length === 36 &&
        db1.pac_proveedor === "stub",
    );
    record(
      "DB: desglose IVA coherente (subtotal + impuestos = total)",
      db1 != null && Math.abs(Number(db1.subtotal) + Number(db1.impuestos) - Number(db1.total)) < 0.02,
    );
    record(
      "DB: receptor público en general con CP del emisor",
      db1?.receptor_rfc === "XAXX010101000" && db1?.receptor_cp === "44100",
    );

    // Doble emisión bloqueada: el form no se muestra estando timbrada
    record("Doble emisión bloqueada en UI", !(await exists(page, btnSel("Emitir factura"))));

    // Cancelar (motivo 02 default)
    await page.goto(posUrl, { waitUntil: "networkidle0" });
    await clickText(page, "Cancelar CFDI");
    record("CFDI cancelada en UI", await hasText(page, "Cancelada", 20000));
    const db2 = await withDb(async (c) => {
      const { rows } = await c.query(
        `select estado, motivo_cancelacion from comprobantes where venta_id = $1 and activo order by created_at desc limit 1`,
        [ctx.ventaId],
      );
      return rows[0] ?? null;
    });
    record("DB: estado cancelada + motivo 02", db2?.estado === "cancelada" && db2?.motivo_cancelacion === "02");

    // Re-emitir tras cancelación (folio incrementa)
    await page.reload({ waitUntil: "networkidle0" });
    await clickText(page, "Emitir factura");
    record("Re-emisión tras cancelar", await hasText(page, "Timbrada", 20000));
    const db3 = await withDb(async (c) => {
      const { rows } = await c.query(
        `select folio, estado from comprobantes
         where venta_id = $1 and activo order by created_at desc limit 1`,
        [ctx.ventaId],
      );
      return rows[0] ?? null;
    });
    record(
      "DB: segundo comprobante con folio siguiente",
      db3?.estado === "timbrada" && Number(db3.folio) === Number(db1?.folio) + 1,
    );

    // Limpieza: desactivar los comprobantes de prueba de esta venta
    await withDb(async (c) => {
      await c.query(`update comprobantes set activo = false where venta_id = $1`, [ctx.ventaId]);
    });
  } catch (e) {
    console.error("ERROR:", e);
    failed++;
  } finally {
    await browser.close();
  }

  if (errors.length) console.log("Errores de consola:", errors.slice(0, 5));
  console.log(`\n${passed} PASS · ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main();
