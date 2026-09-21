import "dotenv/config";

import puppeteer, { type Page } from "puppeteer";

import { login } from "./lib/e2e";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = ".smoke-shots/flows";
const TIME_ZONE = "America/Mexico_City";

// Organización dedicada de pruebas: el flujo solo puede escribir aquí. La
// guarda de `resolveContext` aborta antes de tocar datos si el usuario o el
// ID no corresponden a "Estética Prueba E2E".
const E2E_ORG_ID = "652c172c-bf32-4b9c-90d1-006eded7ff56";
const E2E_ORG_NOMBRE = "Estética Prueba E2E";
const email = process.env.PERF_EMAIL ?? "e2e-salon@test.dev";

const E2E_MARK = "E2E-SMOKE";
const E2E_NOTAS = `%${E2E_MARK}%`;

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const consoleErrors: string[] = [];

function record(step: string, ok: boolean, detail?: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${detail ? ` — ${detail}` : ""}`);
}

function todayKey(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "16:30" → "04:30" para comparar contra el aria-label en formato 12h. */
function hora12(slot: string) {
  const [h, m] = slot.split(":").map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Needle único para abrirDetalle: "09:00 a.m." — distingue la tarjeta de cita
 * de los botones de turno ("Desactivar turno 09:00–19:00"). */
function citaNeedle(slot: string) {
  const h = Number(slot.split(":")[0]);
  return `${hora12(slot)} ${h < 12 ? "a.m." : "p.m."}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

type E2EContext = { orgId: string; branchId: string; adminId: string; timeZone: string };

/**
 * Resuelve EXCLUSIVAMENTE la organización E2E autorizada. Aborta si el usuario
 * no es miembro activo o si el ID/nombre no coinciden: el flujo escribe datos
 * y nunca debe resolver otra organización por orden alfabético.
 */
async function resolveContext(): Promise<E2EContext> {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `with u as (
         select id from usuarios where correo = $1
       ),
       o as (
         select org.id, org.nombre, org.zona_horaria
         from organizaciones org
         where org.id = $2
           and exists (
             select 1 from miembros_organizaciones mo, u
             where mo.organizacion_id = org.id
               and mo.usuario_id = u.id and mo.estado = 'activo'
           )
       ),
       b as (
         select s.id, coalesce(s.zona_horaria, o.zona_horaria) as tz
         from sucursales s join o on o.id = s.organizacion_id
         where s.activo
         order by s.nombre limit 1
       )
       select (select id from u) as admin_id,
              (select id from o) as org_id,
              (select nombre from o) as org_nombre,
              (select id from b) as branch_id,
              coalesce((select tz from b), $3) as tz`,
      [email, E2E_ORG_ID, TIME_ZONE],
    );
    const row = rows[0] ?? {};
    if (row.org_id !== E2E_ORG_ID || row.org_nombre !== E2E_ORG_NOMBRE || !row.branch_id || !row.admin_id) {
      throw new Error(
        `Guarda E2E: se esperaba ${E2E_ORG_NOMBRE} (${E2E_ORG_ID}) con ${email} como miembro activo; se obtuvo ${JSON.stringify(row)}`,
      );
    }
    return { orgId: row.org_id, branchId: row.branch_id, adminId: row.admin_id, timeZone: row.tz };
  });
}

/**
 * Fixtures mínimos que el flujo usa con nombre fijo. Inserts idempotentes
 * marcados con claves E2E-* y acotados a la organización autorizada.
 */
async function ensureFixtures(ctx: E2EContext) {
  await withDb(async (client) => {
    await client.query(
      `insert into servicios (organizacion_id, clave, nombre, duracion_minutos, precio_base, visible_agenda, created_by)
       select $1, 'E2ESRV-CORTE', 'CORTE DE DAMA', 60, 300, true, $2
       where not exists (
         select 1 from servicios where organizacion_id = $1 and nombre = 'CORTE DE DAMA' and activo
       )`,
      [ctx.orgId, ctx.adminId],
    );
    await client.query(
      `insert into productos (organizacion_id, sku, nombre, tipo, costo, precio_venta, stock_minimo, visible_pos, created_by)
       select $1, 'E2EPRD-SHAM', 'SHAMPOO REPARADOR', 'producto', 60, 150, 1, true, $2
       where not exists (
         select 1 from productos where organizacion_id = $1 and nombre = 'SHAMPOO REPARADOR' and activo
       )`,
      [ctx.orgId, ctx.adminId],
    );
    // Stock inicial en la sucursal del flujo: sin fila en inventario_stock el
    // POS no puede vender el producto.
    await client.query(
      `insert into inventario_stock (organizacion_id, sucursal_id, producto_id, stock_actual, created_by)
       select $1, $2, p.id, 20, $3
       from productos p
       where p.organizacion_id = $1 and p.nombre = 'SHAMPOO REPARADOR' and p.activo
         and not exists (
           select 1 from inventario_stock s
           where s.sucursal_id = $2 and s.producto_id = p.id
         )`,
      [ctx.orgId, ctx.branchId, ctx.adminId],
    );
  });
}

/**
 * Desactiva únicamente datos marcados por corridas anteriores (notas E2E-SMOKE)
 * y residuos sin ventas del propio usuario de prueba. Nunca toca datos reales:
 * las citas/ventas/cortes sin marca E2E permanecen intactos.
 */
async function cleanup(ctx: E2EContext) {
  await withDb(async (client) => {
    await client.query(
      `update ventas set activo = false
       where organizacion_id = $1 and (
         cita_id in (select id from citas where organizacion_id = $1 and notas ilike $2)
         or corte_id in (select id from cortes_caja where organizacion_id = $1 and notas ilike $2)
         or notas ilike '%E2E-SMOKE%'
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    await client.query(
      `update citas set activo = false
       where organizacion_id = $1 and notas ilike $2`,
      [ctx.orgId, E2E_NOTAS],
    );
    // Anticipos ligados a citas E2E: quedan invisibles al desactivar la cita,
    // pero se marcan igual para no acumular residuos vigentes.
    await client.query(
      `update anticipos set activo = false
       where organizacion_id = $1 and cita_id in (
         select id from citas where organizacion_id = $1 and notas ilike $2
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    // Paquetes: usos y saldos ligados a ventas E2E (cita marcada o corte E2E),
    // más el catálogo E2E (clave E2EPAQ*) para no acumular residuos.
    await client.query(
      `update paquete_usos set activo = false
       where organizacion_id = $1 and venta_id in (
         select id from ventas where organizacion_id = $1 and (
           cita_id in (select id from citas where organizacion_id = $1 and notas ilike $2)
           or corte_id in (select id from cortes_caja where organizacion_id = $1 and notas ilike $2)
         )
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    await client.query(
      `update cliente_paquetes set activo = false
       where organizacion_id = $1 and (
         cliente_id in (select id from clientes where organizacion_id = $1 and nombre ilike 'E2ECLI%')
         or venta_id in (
           select id from ventas where organizacion_id = $1 and (
             cita_id in (select id from citas where organizacion_id = $1 and notas ilike $2)
             or corte_id in (select id from cortes_caja where organizacion_id = $1 and notas ilike $2)
           )
         )
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    await client.query(
      `update paquetes set activo = false
       where organizacion_id = $1 and clave ilike 'E2EPAQ%'`,
      [ctx.orgId],
    );
    // Membresías E2E: saldos de clientes E2E y catálogo E2EMEM*.
    await client.query(
      `update cliente_membresias set activo = false
       where organizacion_id = $1 and (
         cliente_id in (select id from clientes where organizacion_id = $1 and nombre ilike 'E2ECLI%')
         or venta_id in (
           select id from ventas where organizacion_id = $1 and (
             cita_id in (select id from citas where organizacion_id = $1 and notas ilike $2)
             or corte_id in (select id from cortes_caja where organizacion_id = $1 and notas ilike $2)
           )
         )
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    await client.query(
      `update membresias set activo = false
       where organizacion_id = $1 and clave ilike 'E2EMEM%'`,
      [ctx.orgId],
    );
    // Expediente E2E: fichas y consentimientos de clientes E2E.
    await client.query(
      `update clientes_fichas_tecnicas set activo = false
       where organizacion_id = $1 and (
         cliente_id in (select id from clientes where organizacion_id = $1 and nombre ilike 'E2ECLI%')
         or notas ilike 'E2E%' or formula ilike 'E2E%'
       )`,
      [ctx.orgId],
    );
    await client.query(
      `update clientes_consentimientos set activo = false
       where organizacion_id = $1 and (
         cliente_id in (select id from clientes where organizacion_id = $1 and nombre ilike 'E2ECLI%')
         or titulo ilike 'E2E%'
       )`,
      [ctx.orgId],
    );
    // Cortes E2E interrumpidos y residuos del usuario de prueba sin ventas
    // ligadas: se cierran para que la apertura del run actual pueda ejecutarse.
    // Un corte abierto con ventas reales se respeta y la prueba lo reporta.
    await client.query(
      `update cortes_caja
       set estado = 'cerrado', cerrado_at = now(),
           cerrado_por = coalesce(cerrado_por, $3), activo = false
       where organizacion_id = $1 and estado = 'abierto' and (
         notas ilike $2
         or (usuario_id = $3 and not exists (
           select 1 from ventas v where v.corte_id = cortes_caja.id
         ))
       )`,
      [ctx.orgId, E2E_NOTAS, ctx.adminId],
    );
  });
}

type Rango = { inicio: number; fin: number };

/**
 * Calcula `n` horarios libres (alineados a 15 min) en la sucursal por defecto
 * para el día `fecha`. Evita el carril "sin asignar", el carril del admin y
 * bloqueos generales/personales, y respeta los turnos configurados de la
 * sucursal. Cada slot reserva 90 min para cubrir la duración del servicio.
 */
async function findFreeSlots(ctx: E2EContext, fecha: string, n = 4): Promise<string[]> {
  const SPAN = 90;
  return withDb(async (client) => {
    const { rows: citaRows } = await client.query(
      `select extract(epoch from (fecha_hora at time zone $4)::time) / 60 as inicio,
              duracion_minutos as dur
       from citas
       where organizacion_id = $1 and sucursal_id = $2 and activo
         and estado not in ('completada', 'cancelada', 'no_asistio')
         and (usuario_id is null or usuario_id = $3)
         and (fecha_hora at time zone $4)::date = $5::date`,
      [ctx.orgId, ctx.branchId, ctx.adminId, ctx.timeZone, fecha],
    );
    const { rows: bloqueoRows } = await client.query(
      `select extract(epoch from (inicia_at at time zone $4)::time) / 60 as inicio,
              extract(epoch from (termina_at at time zone $4)::time) / 60 as fin
       from bloqueos_agenda
       where organizacion_id = $1 and sucursal_id = $2 and activo
         and (usuario_id is null or usuario_id = $3)
         and (inicia_at at time zone $4)::date <= $5::date
         and (termina_at at time zone $4)::date >= $5::date`,
      [ctx.orgId, ctx.branchId, ctx.adminId, ctx.timeZone, fecha],
    );
    const { rows: turnoRows } = await client.query(
      `select inicia_minutos as inicio, termina_minutos as fin
       from horarios_sucursales
       where organizacion_id = $1 and sucursal_id = $2 and activo
         and dia_semana = extract(dow from $3::date)`,
      [ctx.orgId, ctx.branchId, fecha],
    );

    const busy: Rango[] = [
      ...citaRows.map((r: { inicio: string; dur: string }) => ({
        inicio: Number(r.inicio),
        fin: Number(r.inicio) + Number(r.dur),
      })),
      ...bloqueoRows.map((r: { inicio: string; fin: string }) => ({
        inicio: Number(r.inicio),
        fin: Number(r.fin),
      })),
    ];
    const turnos: Rango[] = turnoRows.length
      ? turnoRows.map((r: { inicio: string; fin: string }) => ({
          inicio: Number(r.inicio),
          fin: Number(r.fin),
        }))
      : [{ inicio: 8 * 60, fin: 21 * 60 }];

    const libre = (s: number) =>
      turnos.some((t) => s >= t.inicio && s + SPAN <= t.fin) &&
      !busy.some((b) => s < b.fin && s + SPAN > b.inicio);

    const slots: string[] = [];
    for (let m = 0; m <= 24 * 60 - SPAN && slots.length < n; m += 15) {
      if (!libre(m)) continue;
      slots.push(
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
      );
      busy.push({ inicio: m, fin: m + SPAN });
    }
    if (slots.length < n) {
      throw new Error(`Solo ${slots.length}/${n} horarios libres para ${fecha}`);
    }
    return slots;
  });
}

/** Asigna la cita E2E pendiente más reciente al usuario admin (Mi día). */
async function asignarCitaAlAdmin(ctx: E2EContext) {
  await withDb(async (client) => {
    await client.query(
      `update citas set usuario_id = $2
       where id = (
         select id from citas
         where organizacion_id = $1 and notas ilike $3
           and activo = true and estado = 'pendiente'
         order by created_at desc limit 1
       )`,
      [ctx.orgId, ctx.adminId, E2E_NOTAS],
    );
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: true });
}

async function waitForText(page: Page, text: string, timeout = 15000) {
  await page.waitForFunction(
    (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text,
  );
}

/**
 * Espera texto recargando la página cada ~6 s. La caché de Hyperdrive puede
 * servir el SELECT del board con datos anteriores a la escritura (read-after-
 * write staleness), así que un solo reload no basta: hay que insistir hasta
 * que la caché expire o el dato aparezca.
 */
async function waitForTextReload(page: Page, text: string, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = await page.evaluate(
      (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
      text,
    );
    if (found) return;
    if (Date.now() > deadline) throw new Error(`Texto no encontrado tras recargas: ${text}`);
    await sleep(6000);
    await page.reload({ waitUntil: "networkidle0" }).catch(() => {});
  }
}

/**
 * Repite `check` recargando cada ~6 s hasta que sea cierto o venza el plazo.
 * Las escrituras por server actions tardan varios segundos en producción y un
 * reload inmediato puede abortar el POST o leer antes de que termine.
 */
async function pollReload(page: Page, check: () => Promise<boolean>, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() > deadline) return false;
    await sleep(6000);
    await page.reload({ waitUntil: "networkidle0" }).catch(() => {});
  }
}

/** Espera a que cualquier dialog/alertdialog se cierre (acción completada). */
async function closeDialogs(page: Page, timeout = 30_000) {
  await page
    .waitForFunction(() => !document.querySelector('[role="dialog"], [role="alertdialog"]'), {
      timeout,
    })
    .catch(() => {});
}

async function clickText(page: Page, selector: string, text: string, scopeSelector?: string) {
  const clicked = await page.evaluate(
    (sel, t, scope) => {
      const root = scope ? document.querySelector(scope) : document;
      if (!root) return false;
      const els = Array.from(root.querySelectorAll<HTMLElement>(sel));
      const target = els.find((el) => el.textContent?.trim() === t) ??
        els.find((el) => el.textContent?.toLowerCase().includes(t.toLowerCase()));
      if (!target) return false;
      target.click();
      return true;
    },
    selector,
    text,
    scopeSelector ?? null,
  );
  return clicked;
}

/** Fija el valor de un input (setter nativo + eventos), reintentando si la hidratación lo resetea. */
async function setNativeInput(page: Page, selector: string, value: string, scopeSelector?: string) {
  for (let i = 0; i < 20; i++) {
    const found = await page.evaluate(
      (sel, val, scope) => {
        const root = scope ? document.querySelector(scope) : document;
        const el = root?.querySelector(sel);
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      selector,
      value,
      scopeSelector ?? null,
    );
    if (!found) throw new Error(`Input no encontrado: ${selector}`);
    const check = () =>
      page.evaluate(
        (sel, val, scope) => {
          const root = scope ? document.querySelector(scope) : document;
          const el = root?.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel);
          return el?.value === val;
        },
        selector,
        value,
        scopeSelector ?? null,
      );
    await sleep(350);
    if (!(await check())) continue;
    // La hidratación de React puede resetear un defaultValue no controlado
    // después del primer check; confirmamos que el valor sobrevive un tramo más.
    await sleep(700);
    if (await check()) return;
  }
  throw new Error(`No se pudo fijar ${selector}`);
}

/** Selecciona una opción de un Combobox (Base UI) identificado por su label. */
async function pickCombobox(page: Page, labelText: string, query: string) {
  const inputId = await page.evaluate((label) => {
    const lab = Array.from(document.querySelectorAll("label")).find((l) =>
      l.textContent?.toLowerCase().includes(label.toLowerCase()),
    );
    return lab?.htmlFor ?? null;
  }, labelText);
  if (!inputId) throw new Error(`Combobox sin label: ${labelText}`);
  const selector = `[id="${inputId.replace(/"/g, '\\"')}"]`;
  await page.click(selector);
  await page.type(selector, query);
  await page.waitForSelector('[role="option"]', { visible: true, timeout: 8000 });
  const picked = await page.evaluate((q) => {
    const opt = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
      o.textContent?.toLowerCase().includes(q.toLowerCase()),
    );
    if (!opt) return false;
    opt.click();
    return true;
  }, query);
  if (!picked) throw new Error(`Opción no encontrada: ${query}`);
  await sleep(200);
}

async function main() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // Dev mode recompila rutas tras cambios; 60s absorbe compiles pesadas.
  page.setDefaultNavigationTimeout(60_000);
  // En headless el rAF puede pausarse y el polling por default de
  // waitForFunction deja de re-evaluar aunque la condición ya se cumplió
  // (mismo motivo que en login() de lib/e2e). Forzamos polling por intervalo.
  const waitForFunctionOriginal = page.waitForFunction.bind(page);
  page.waitForFunction = ((fn: unknown, opts: object = {}, ...args: unknown[]) =>
    waitForFunctionOriginal(fn as never, { polling: 100, ...opts } as never, ...(args as never[]))) as typeof page.waitForFunction;
  await page.setViewport({ width: 1440, height: 900 });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[${page.url()}] ${msg.text()}`);
  });
  page.on("pageerror", (err: unknown) =>
    consoleErrors.push(`pageerror: ${err instanceof Error ? err.message : String(err)}`),
  );

  const ctx = await resolveContext();
  const fecha = todayKey(ctx.timeZone);

  try {
    await cleanup(ctx);
    await ensureFixtures(ctx);
    // Horarios libres reales: la cita inicial, el destino de "Mover", la
    // segunda cita y el destino de "Reagendar" nunca chocan con datos
    // preexistentes ni entre sí.
    const slots = await findFreeSlots(ctx, fecha, 4);
    console.log(`Horarios E2E (${ctx.timeZone}): ${slots.join(", ")}`);

    // ── Sesión (cookie directa: el sign-in remoto puede leer el hash viejo
    // desde la caché de Hyperdrive tras un reset de contraseña) ────────────
    await login(page, email);
    record("Sesión E2E en /admin", page.url().includes("/admin"));

    // ── Agenda: crear cita ────────────────────────────────────────────────
    const crearCita = async (hhmm: string, notas: string) => {
      await clickText(page, "button", "Nueva cita");
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await setNativeInput(page, '[role="dialog"] input[name="fechaHora"]', `${fecha}T${hhmm}`);
      await setNativeInput(page, '[role="dialog"] textarea[name="notas"]', notas);
      await clickText(page, '[role="dialog"] [role="tab"]', "Servicios");
      await sleep(300);
      const marcado = await clickText(page, '[role="dialog"] label', "CORTE DE DAMA");
      if (!marcado) throw new Error("Servicio CORTE DE DAMA no encontrado en el diálogo");
      await clickText(page, '[role="dialog"] button[type="submit"]', "Crear cita");
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
        { timeout: 30000 },
      );
      // El board no siempre refleja la revalidación del server action en
      // headless; recargar garantiza la tarjeta nueva en el DOM.
      await page.reload({ waitUntil: "networkidle0" });
    };

    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await crearCita(slots[0], E2E_MARK);
    await waitForTextReload(page, "Walk-in");
    await shot(page, "02-cita-creada");
    record(`Crear cita walk-in a las ${slots[0]}`, true);

    // ── Agenda: mover cita sin drag ───────────────────────────────────────
    const abrirDetalle = async (needle: string) => {
      const clicked = await page.evaluate((n) => {
        const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find((b) =>
          (b.getAttribute("aria-label") ?? "").toLowerCase().includes(n.toLowerCase()),
        );
        if (!btn) return false;
        btn.click();
        return true;
      }, needle);
      if (!clicked) throw new Error(`Tarjeta de cita no encontrada: ${needle}`);
      // El panel lateral es inline (xl, vista día) o Sheet overlay (resto).
      await page.waitForSelector('button[aria-label="Cerrar panel"]', { visible: true, timeout: 15000 });
    };
    const clickPanel = (texto: string) => clickText(page, "button", texto);
    /** Click en acción del panel que debe abrir un diálogo; reintenta si no abre. */
    const clickPanelDialog = async (texto: string, waitSel: string) => {
      for (let i = 0; i < 3; i++) {
        await clickPanel(texto);
        const ok = await page
          .waitForSelector(waitSel, { visible: true, timeout: 12000 })
          .then(() => true)
          .catch(() => false);
        if (ok) return;
      }
      throw new Error(`Panel: "${texto}" no abrió ${waitSel}`);
    };
    const cardAria = (estado: string, extra?: string) =>
      page.evaluate(
        ([e, x]) =>
          Array.from(document.querySelectorAll("button[aria-label]")).some((b) => {
            const label = (b.getAttribute("aria-label") ?? "").toLowerCase();
            return label.startsWith(e) && (!x || label.includes(x));
          }),
        [estado, extra ?? ""],
      );
    const waitPendingClear = () =>
      page.waitForFunction(
        () => {
          const busy = ["agregando", "cobrando", "guardando", "registrando", "aplicando", "moviendo"];
          return !Array.from(document.querySelectorAll("button")).some((b) =>
            busy.some((t) => b.textContent?.toLowerCase().includes(t)),
          );
        },
        { timeout: 30000 },
      );

    await abrirDetalle(citaNeedle(slots[0]));
    await clickPanelDialog("Mover", '[role="dialog"] input[type="time"]');
    await setNativeInput(page, '[role="dialog"] input[type="time"]', slots[1]);
    await shot(page, "03-mover-cita");
    await clickText(page, '[role="dialog"] button[type="submit"]', "Mover cita");
    await closeDialogs(page);
    await waitPendingClear().catch(() => {});
    record(
      `Mover cita a las ${slots[1]} (sin drag)`,
      await pollReload(page, () => cardAria("pendiente", hora12(slots[1]))),
    );

    // ── Agenda: transición de estado ──────────────────────────────────────
    await abrirDetalle(citaNeedle(slots[1]));
    await clickPanel("Confirmar");
    await waitPendingClear().catch(() => {});
    record("Transición pendiente → confirmada", await pollReload(page, () => cardAria("confirmada")));
    /** page.select con reintento: el select controlado se resetea si React aún no hidrata. */
    const selectOption = async (selector: string, value: string) => {
      for (let i = 0; i < 30; i++) {
        await page.evaluate(
          (sel, val) => {
            const el = document.querySelector<HTMLSelectElement>(sel);
            if (!el) return;
            el.value = val;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          },
          selector,
          value,
        );
        await sleep(700);
        const stuck = await page.evaluate(
          (sel, val) => document.querySelector<HTMLSelectElement>(sel)?.value === val,
          selector,
          value,
        );
        if (stuck) return;
      }
      throw new Error(`No se pudo fijar ${selector}=${value}`);
    };
    /** Abre el sheet de cobro desde el panel lateral de la cita. */
    const abrirCobro = async () => {
      const ok = (await clickPanel("Ver venta")) || (await clickPanel("Cobrar"));
      if (!ok) throw new Error("Panel sin acción Cobrar/Ver venta");
      await page.waitForSelector('[role="dialog"]', { visible: true, timeout: 15000 });
      await waitForText(page, "Agregar al ticket");
    };
    /** Tarjeta del catálogo POS → línea del ticket (reintenta hasta que hidrate React). */
    const agregarAlTicket = async (tab: "Servicios" | "Productos" | "Paquetes" | "Membresías", nombre: string) => {
      // Las líneas de paquete/membresía no tienen control de cantidad: se
      // confirman por su botón "Quitar <nombre>".
      const selector = tab === "Paquetes" || tab === "Membresías" ? `[aria-label="Quitar ${nombre}"]` : `[aria-label="Cantidad de ${nombre}"]`;
      for (let intento = 0; intento < 3; intento++) {
        await clickText(page, '[role="group"][aria-label="Tipo de catálogo"] button', tab);
        await sleep(300);
        const ok = await page.evaluate((n) => {
          const btn = document.querySelector<HTMLButtonElement>(`button[aria-label="Agregar ${n} al ticket"]`);
          if (!btn) return "missing";
          // Mientras la acción corre el botón queda disabled: no re-clicar.
          if (btn.disabled) return "pending";
          btn.click();
          return "clicked";
        }, nombre);
        if (ok === "missing") throw new Error(`Tarjeta de catálogo no encontrada: ${nombre}`);
        const aparecio = await page
          .waitForSelector(selector, { visible: true, timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        if (aparecio) return;
      }
      throw new Error(`La línea ${nombre} no apareció en el ticket tras 3 intentos`);
    };
    /** Espera resultado del cobro: sheet cerrado (inline), redirect (página) o error visible. */
    const esperarResultadoCobro = async (enSheet: boolean) => {
      await page.waitForFunction(
        (sheet) => {
          const texto = document.body.innerText.toLowerCase();
          if (
            texto.includes("stock insuficiente") ||
            texto.includes("no se pudo") ||
            texto.includes("invalid input") ||
            texto.includes("no cubren")
          ) return true;
          if (sheet) return !document.querySelector('[role="dialog"]');
          return (
            (location.pathname === "/admin/pos" && !location.search.includes("ventaId")) ||
            location.pathname.startsWith("/admin/agenda")
          );
        },
        { timeout: 25000 },
        enSheet,
      );
    };
    const clickCobrar = () => clickText(page, '[role="dialog"] button[type="submit"]', "Cobrar");

    await abrirDetalle(citaNeedle(slots[1]));
    await shot(page, "04-detalle-cita");
    await abrirCobro();
    await shot(page, "05-checkout-sheet");
    record("Cobrar desde la cita abre el sheet de checkout", true);

    // ── POS: agregar producto y servicio (selector de catálogo) ───────────
    await agregarAlTicket("Productos", "SHAMPOO REPARADOR");
    await agregarAlTicket("Servicios", "CORTE DE DAMA");
    await shot(page, "06-ticket-lineas");
    record("Agregar producto y servicio al ticket", true);

    // Estado determinista: ajustar el stock de SHAMPOO a 0 para probar la guarda
    await page.goto(`${BASE_URL}/admin/inventario`, { waitUntil: "networkidle0" });
    await pickCombobox(page, "Producto o insumo", "SHAMPOO");
    await selectOption('select[name="tipo"]', "ajuste");
    await setNativeInput(page, 'input[name="cantidad"]', "0");
    await setNativeInput(page, 'textarea[name="notas"]', "E2E-SMOKE ajuste a cero");
    await clickText(page, 'button[type="submit"]', "Registrar movimiento");
    await waitPendingClear();
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Movimiento registrado") ||
        document.body.innerText.includes("ya coincide"),
      { timeout: 15000 },
    );
    record("Ajuste de stock a 0 para prueba", true);

    // Cobro que debe fallar: stock de SHAMPOO está en 0
    // (al abrir la venta la cita pasó a "en proceso")
    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await abrirDetalle(citaNeedle(slots[1]));
    await abrirCobro();
    await clickCobrar();
    await esperarResultadoCobro(true);
    const stockBloqueo = await page.evaluate(() =>
      document.body.innerText.toLowerCase().includes("stock insuficiente"),
    );
    record("Cobro bloqueado por stock insuficiente (0)", stockBloqueo);
    await shot(page, "07-cobro-bloqueado");

    // ── Inventario: entrada para reponer stock ────────────────────────────
    await page.goto(`${BASE_URL}/admin/inventario`, { waitUntil: "networkidle0" });
    await pickCombobox(page, "Producto o insumo", "SHAMPOO");
    await setNativeInput(page, 'input[name="cantidad"]', "10");
    await setNativeInput(page, 'textarea[name="notas"]', "E2E-SMOKE reposición");
    await clickText(page, 'button[type="submit"]', "Registrar movimiento");
    await waitPendingClear();
    await waitForText(page, "Movimiento registrado");
    await page.reload({ waitUntil: "networkidle0" });
    const stockOk = await page.evaluate(() => document.body.innerText.includes("10.000"));
    record("Entrada de inventario +10 (stock 0 → 10)", stockOk);

    // Pestañas Retail/Backbar separan venta al público de consumo de cabina.
    const tabsInventario = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent ?? "");
      return tabs.some((t) => t.includes("Retail")) && tabs.some((t) => t.includes("Backbar"));
    });
    record("Inventario: pestañas Retail/Backbar", tabsInventario);
    if (tabsInventario) {
      await clickText(page, '[role="tab"]', "Backbar");
      await sleep(400);
      const consumoVisible = await page.evaluate(() => {
        const activa = Array.from(document.querySelectorAll('[role="tab"]')).find(
          (t) => t.getAttribute("aria-selected") === "true" || t.hasAttribute("data-active"),
        );
        const contenido = Array.from(document.querySelectorAll('[role="tabpanel"]')).some((p) =>
          p.textContent?.includes("Consumo por servicio"),
        );
        return Boolean(activa?.textContent?.includes("Backbar")) && contenido;
      });
      record("Inventario: reporte Consumo por servicio (backbar)", consumoVisible);
    }
    await shot(page, "08-inventario-entrada");

    // Salida sin notas debe fallar
    await pickCombobox(page, "Producto o insumo", "SHAMPOO");
    await selectOption('select[name="tipo"]', "salida");
    await setNativeInput(page, 'input[name="cantidad"]', "1");
    await setNativeInput(page, 'textarea[name="notas"]', "");
    await clickText(page, 'button[type="submit"]', "Registrar movimiento");
    const notasRequeridas = await page
      .waitForFunction(
        () => document.body.innerText.toLowerCase().includes("motivo"),
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Salida sin notas rechazada", notasRequeridas);

    // ── Cobro inline con stock: cierra el sheet y completa la cita ────────
    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await abrirDetalle(citaNeedle(slots[1]));
    await abrirCobro();
    await clickCobrar();
    await esperarResultadoCobro(true);
    await sleep(600);
    const sheetCerro = await page.evaluate(
      () => !document.body.innerText.includes("Cobro de la cita"),
    );
    record("Cobro exitoso cierra el sheet (modo inline)", sheetCerro);
    await page.reload({ waitUntil: "networkidle0" });
    record("Cita marcada completada tras el cobro", await cardAria("completada"));
    await shot(page, "09-cita-completada");

    // ── POS walk-in completo ──────────────────────────────────────────────
    await page.goto(`${BASE_URL}/admin/pos`, { waitUntil: "networkidle0" });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    record("Abrir venta walk-in crea ticket", page.url().includes("ventaId"));
    const ventaWalkinUrl = page.url();
    await waitForTextReload(page, "Agregar al ticket");
    await agregarAlTicket("Servicios", "CORTE DE DAMA");
    // Propina por atajo: 10% de $300 = $30 → cobro total $330
    await clickText(page, '[role="group"][aria-label="Propina"] button', "10%");
    const propinaOk = await page.evaluate(() => document.body.innerText.includes("$330.00"));
    record("Propina 10% actualiza el total del cobro", propinaOk);
    // Medio: elegir EFECTIVO explícitamente (no depende del orden del catálogo
    // ni de referencias obligatorias de otros medios).
    const efectivoOk = await page.evaluate(() => {
      const grupo = document.querySelector('[role="group"][aria-label="Medio del pago 1"]');
      const chip = Array.from(grupo?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.toUpperCase().includes("EFECTIVO"),
      );
      if (!chip) return false;
      chip.click();
      return true;
    });
    if (!efectivoOk) throw new Error("Chip de medio EFECTIVO no encontrado");
    await sleep(300);
    const montoSincronizado = await page.waitForFunction(
      () => document.querySelector<HTMLInputElement>('input[aria-label="Monto del pago 1"]')?.value === "330.00",
      { timeout: 8000 },
    ).then(() => true).catch(() => false);
    record("Monto del pago se sincroniza con total + propina", montoSincronizado);
    await clickText(page, 'button[type="submit"]', "Cobrar");
    await esperarResultadoCobro(false);
    await page.goto(`${BASE_URL}/admin/pos`, { waitUntil: "networkidle0" });
    await waitForText(page, "Ventas de hoy");
    const ventasListadas = await page.evaluate(() => document.body.innerText.includes("Completada"));
    record("Venta walk-in cobrada aparece en Ventas de hoy", ventasListadas);
    await shot(page, "10-pos-walkin");

    // ── POS: devolución parcial por línea (venta cobrada sigue "completada")
    await page.goto(ventaWalkinUrl, { waitUntil: "networkidle0" });
    await waitForText(page, "Venta cerrada");
    await clickText(page, "button", "Devolver líneas…");
    await page.waitForSelector('input[aria-label="Cantidad a devolver de CORTE DE DAMA"]', { visible: true });
    await setNativeInput(page, 'input[aria-label="Cantidad a devolver de CORTE DE DAMA"]', "1");
    await setNativeInput(page, 'input[name="motivo"]', "E2E-SMOKE devolución parcial");
    await clickText(page, 'button[type="submit"]', "Registrar devolución");
    await waitPendingClear();
    await page.reload({ waitUntil: "networkidle0" });
    const devolucionVisible = await page.evaluate(() => {
      const texto = document.body.innerText;
      return texto.includes("Devoluciones") && texto.includes("E2E-SMOKE devolución parcial");
    });
    record("Devolución parcial registrada y visible en el ticket", devolucionVisible);
    await shot(page, "10b-devolucion-parcial");
    await page.goto(`${BASE_URL}/admin/pos`, { waitUntil: "networkidle0" });

    // ── POS: descuento en ticket ──────────────────────────────────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await agregarAlTicket("Servicios", "CORTE DE DAMA");
    await setNativeInput(page, 'input[name="descuento"]', "50");
    await clickText(page, 'button[type="submit"]', "Aplicar");
    await waitPendingClear();
    await waitForText(page, "$250.00");
    record("Descuento de $50 reduce el total a $250", true);
    await shot(page, "11-descuento");

    // ── Agenda: editar cita ───────────────────────────────────────────────
    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await crearCita(slots[2], `${E2E_MARK} segunda`);
    await waitForTextReload(page, "Walk-in");
    await abrirDetalle(citaNeedle(slots[2]));
    await clickPanelDialog("Editar", '[role="dialog"] textarea[name="notas"]');
    await setNativeInput(page, '[role="dialog"] textarea[name="notas"]', "E2E-SMOKE editada");
    await clickText(page, '[role="dialog"] button[type="submit"]', "Guardar cambios");
    await closeDialogs(page);
    const notaEditada = await pollReload(page, async () => {
      await abrirDetalle(citaNeedle(slots[2])).catch(() => {});
      return page.evaluate(() => document.body.innerText.includes("E2E-SMOKE editada"));
    });
    record("Editar cita actualiza las notas", notaEditada);

    // ── Agenda: cancelar y reagendar ──────────────────────────────────────
    await clickPanel("Cancelar cita");
    await page.waitForSelector('[role="alertdialog"]', { visible: true });
    await clickText(page, '[role="alertdialog"] button', "Cancelar cita");
    await closeDialogs(page);
    await waitPendingClear().catch(() => {});
    record("Cancelar cita cambia el estado", await pollReload(page, () => cardAria("cancelada")));

    await pollReload(page, async () => {
      await abrirDetalle(citaNeedle(slots[2])).catch(() => {});
      return page.evaluate(() => Boolean(document.querySelector('button[aria-label="Cerrar panel"]')));
    });
    await clickPanelDialog("Reagendar", '[role="dialog"] input[type="time"]');
    await setNativeInput(page, '[role="dialog"] input[type="time"]', slots[3]);
    await clickText(page, '[role="dialog"] button[type="submit"]', "Reagendar");
    await closeDialogs(page);
    await waitPendingClear().catch(() => {});
    record(
      `Reagendar rescata cita cancelada → pendiente ${slots[3]}`,
      await pollReload(page, () => cardAria("pendiente", hora12(slots[3]))),
    );
    await shot(page, "12-cita-reagendada");

    // ── Agenda: vistas semana y lista interactivas ────────────────────────
    await page.goto(`${BASE_URL}/admin/agenda?vista=semana`, { waitUntil: "networkidle0" });
    await pollReload(page, async () => {
      await abrirDetalle(citaNeedle(slots[3])).catch(() => {});
      return page.evaluate(() => Boolean(document.querySelector('button[aria-label="Cerrar panel"]')));
    });
    const detalleSemana = await page.evaluate(() =>
      Boolean(document.querySelector('button[aria-label="Cerrar panel"]')),
    );
    record("Vista semana: tarjeta abre detalle", detalleSemana);
    await shot(page, "13-semana-detalle");
    await page.keyboard.press("Escape");
    await sleep(300);

    await page.goto(`${BASE_URL}/admin/agenda?vista=lista`, { waitUntil: "networkidle0" });
    await clickText(page, "button", "Ver");
    const detalleLista = await page
      .waitForSelector('[role="dialog"]', { visible: true, timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    record("Vista lista: botón Ver abre detalle", detalleLista);
    await shot(page, "14-lista-detalle");

    // ── Mi día (vista estilista) ──────────────────────────────────────────
    // La cita reagendada (pendiente 19:30) se asigna al admin para probar el
    // flujo personal: check-in → cobro → ticket POS con returnTo.
    await asignarCitaAlAdmin(ctx);
    await page.goto(`${BASE_URL}/admin/mi-dia`, { waitUntil: "networkidle0" });
    await waitForText(page, "Mi día");
    const miDiaOk = await page.evaluate(() => {
      const texto = document.body.innerText;
      return (
        texto.includes("Por atender") &&
        texto.includes("Propinas") &&
        texto.includes("Comisiones")
      );
    });
    record("Mi día: resumen de propinas y comisiones", miDiaOk);
    const miDiaCita = await pollReload(page, () =>
      page.evaluate(() => document.body.innerText.includes("Walk-in")),
    );
    record("Mi día lista la cita asignada al usuario", miDiaCita);
    const tabBarOk = await page.evaluate(
      () => Boolean(document.querySelector('nav[aria-label="Accesos rápidos"]')),
    );
    record("Tab bar móvil presente en el shell", tabBarOk);
    await shot(page, "15-mi-dia");

    await clickText(page, "button", "Cliente en silla");
    await waitPendingClear().catch(() => {});
    const checkInOk = await pollReload(page, () =>
      page.evaluate(() => document.body.innerText.includes("En proceso")),
    );
    record("Mi día: check-in pasa la cita a en proceso", checkInOk);

    await clickText(page, "button", "Cobrar");
    await page.waitForFunction(
      () => location.pathname === "/admin/pos" && location.search.includes("ventaId"),
      { timeout: 20000 },
    );
    await waitForTextReload(page, "Agregar al ticket");
    const vuelveMiDia = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).some((a) =>
        (a.getAttribute("href") ?? "").includes("/admin/mi-dia"),
      ),
    );
    record("Mi día: Cobrar abre ticket POS con returnTo", vuelveMiDia);
    await shot(page, "16-mi-dia-cobro");

    // Retorno exacto: cobrar el ticket en modo página redirige a /admin/mi-dia.
    await clickText(page, 'button[type="submit"]', "Cobrar");
    const retornoExacto = await page
      .waitForFunction(() => location.pathname === "/admin/mi-dia", { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    record("Cobro desde ticket regresa a Mi día (returnTo)", retornoExacto);
    await shot(page, "16b-mi-dia-retorno");

    // ── Catálogos: alta en cada módulo ────────────────────────────────────
    const runId = Date.now().toString(36).toUpperCase();
    const fill = (name: string, value: string) =>
      setNativeInput(page, `form [name="${name}"]`, value);

    const catalogos: Array<{
      ruta: string;
      campos: Record<string, string>;
      submit: string;
      nombreVisible: string;
    }> = [
      { ruta: "categorias-servicios", campos: { clave: `E2ECS${runId}`, nombre: `E2E CatServ ${runId}` }, submit: "Guardar categoría", nombreVisible: `E2E CatServ ${runId}` },
      { ruta: "categorias-productos", campos: { clave: `E2ECP${runId}`, nombre: `E2E CatProd ${runId}` }, submit: "Guardar categoría", nombreVisible: `E2E CatProd ${runId}` },
      { ruta: "unidades-medida", campos: { clave: `E2EUM${runId}`, nombre: `E2E Unidad ${runId}` }, submit: "Guardar unidad", nombreVisible: `E2E Unidad ${runId}` },
      { ruta: "impuestos", campos: { clave: `E2EIMP${runId}`, nombre: `E2E Impuesto ${runId}`, tasa: "5" }, submit: "Guardar impuesto", nombreVisible: `E2E Impuesto ${runId}` },
      { ruta: "medios-pago", campos: { clave: `E2EMP${runId}`, nombre: `E2E Pago ${runId}` }, submit: "Guardar medio de pago", nombreVisible: `E2E Pago ${runId}` },
      { ruta: "promociones", campos: { clave: `E2EPRO${runId}`, nombre: `E2E Promo ${runId}`, valor: "10", vigenciaDesde: fecha }, submit: "Guardar promoción", nombreVisible: `E2E Promo ${runId}` },
      { ruta: "servicios", campos: { clave: `E2ESRV${runId}`, nombre: `E2E Servicio ${runId}`, duracionMinutos: "45", precioBase: "120" }, submit: "Guardar servicio", nombreVisible: `E2E Servicio ${runId}` },
      { ruta: "productos", campos: { sku: `E2EPRD${runId}`, nombre: `E2E Producto ${runId}`, costo: "10", precioVenta: "25", stockMinimo: "1" }, submit: "Guardar producto", nombreVisible: `E2E Producto ${runId}` },
    ];

    for (const mod of catalogos) {
      await page.goto(`${BASE_URL}/admin/${mod.ruta}`, { waitUntil: "networkidle0" });
      for (const [name, value] of Object.entries(mod.campos)) await fill(name, value);
      await clickText(page, 'button[type="submit"]', mod.submit);
      await waitPendingClear();
      await sleep(800);
      await page.goto(`${BASE_URL}/admin/${mod.ruta}`, { waitUntil: "networkidle0" });
      const creado = await page.evaluate(
        (n) => document.body.innerText.includes(n),
        mod.nombreVisible,
      );
      record(`Catálogo ${mod.ruta}: alta visible`, creado);
    }
    await shot(page, "16-catalogos");

    // ── Paquetes: alta en catálogo (combobox de servicio aparte) ─────────
    const paqueteNombre = `E2E Paquete ${runId}`;
    await page.goto(`${BASE_URL}/admin/paquetes`, { waitUntil: "networkidle0" });
    await fill("clave", `E2EPAQ${runId}`);
    await fill("nombre", paqueteNombre);
    await pickCombobox(page, "Servicio cubierto", "CORTE DE DAMA");
    await fill("sesiones", "3");
    await fill("precio", "800");
    await clickText(page, 'button[type="submit"]', "Guardar paquete");
    await waitPendingClear();
    await sleep(800);
    await page.goto(`${BASE_URL}/admin/paquetes`, { waitUntil: "networkidle0" });
    const paqueteCreado = await page.evaluate(
      (n) => document.body.innerText.includes(n),
      paqueteNombre,
    );
    record("Catálogo paquetes: alta visible", paqueteCreado);

    // ── Membresías: alta en catálogo (una vigente y otra para la prueba de
    // vigencia: se le inserta un saldo vencido directo en base) ─────────
    const membresiaNombre = `E2E Membresía ${runId}`;
    const membresiaVencidaNombre = `E2E Membresía Vencida ${runId}`;
    for (const [clave, nombre] of [
      [`E2EMEM${runId}`, membresiaNombre],
      [`E2EMEMV${runId}`, membresiaVencidaNombre],
    ] as const) {
      await page.goto(`${BASE_URL}/admin/membresias`, { waitUntil: "networkidle0" });
      await fill("clave", clave);
      await fill("nombre", nombre);
      await fill("precio", "500");
      await fill("duracionDias", "30");
      await fill("descuentoPorcentaje", "10");
      await clickText(page, 'button[type="submit"]', "Guardar membresía");
      await waitPendingClear();
      await sleep(800);
    }
    await page.goto(`${BASE_URL}/admin/membresias`, { waitUntil: "networkidle0" });
    const membresiaCreada = await page.evaluate(
      (n) => document.body.innerText.includes(n),
      membresiaNombre,
    );
    record("Catálogo membresías: alta visible", membresiaCreada);

    // ── Servicios: editar y ocultar ───────────────────────────────────────
    const servicioNombre = `E2E Servicio ${runId}`;
    await page.goto(`${BASE_URL}/admin/servicios?q=${encodeURIComponent(servicioNombre)}`, { waitUntil: "networkidle0" });
    await clickText(page, "a", "Editar");
    await page.waitForFunction(
      () => document.body.innerText.includes("Editar servicio"),
      { timeout: 10000 },
    );
    await fill("precioBase", "150");
    await clickText(page, 'button[type="submit"]', "Guardar servicio");
    await waitPendingClear();
    await sleep(800);
    await page.goto(`${BASE_URL}/admin/servicios?q=${encodeURIComponent(servicioNombre)}`, { waitUntil: "networkidle0" });
    const precioEditado = await page.evaluate(() => document.body.innerText.includes("150"));
    record("Servicios: edición refleja nuevo precio", precioEditado);

    const ocultado = await page.evaluate((n) => {
      const row = Array.from(document.querySelectorAll("tr")).find((tr) => tr.textContent?.includes(n));
      const btn = row?.querySelector<HTMLElement>('button[type="submit"]');
      if (!btn || !btn.textContent?.includes("Ocultar")) return false;
      btn.click();
      return true;
    }, servicioNombre);
    if (ocultado) {
      await sleep(1200);
      await page.reload({ waitUntil: "networkidle0" });
    }
    const estaOculto = await page.evaluate(
      (n) => {
        const row = Array.from(document.querySelectorAll("tr")).find((tr) => tr.textContent?.includes(n));
        return row?.textContent?.includes("Oculto") ?? false;
      },
      servicioNombre,
    );
    record("Servicios: ocultar cambia el estado", ocultado && estaOculto);

    // ── Clientes: alta, búsqueda y edición ────────────────────────────────
    const clienteNombre = `E2ECLI${runId}`;
    // Teléfono único por corrida: evita el warning de duplicado del backend.
    const clienteTelefono = `55${String(Date.now()).slice(-8)}`;
    await page.goto(`${BASE_URL}/admin/clientes`, { waitUntil: "networkidle0" });
    // El alta vive en un panel lateral: hay que abrirlo antes de llenar.
    await clickText(page, "a", "Nuevo cliente");
    await page.waitForFunction(
      () => document.body.innerText.includes("Solo el nombre es obligatorio"),
      { timeout: 10000 },
    );
    await fill("nombre", clienteNombre);
    await fill("telefono", clienteTelefono);
    await clickText(page, 'button[type="submit"]', "Guardar cliente");
    await waitPendingClear();
    const altaHandle = await page.waitForFunction(
      () => {
        const texto = document.body.innerText.toLowerCase();
        if (texto.includes("cliente guardado")) return "ok";
        if (texto.includes("obligatorio") || texto.includes("inválido") || texto.includes("no se pudo")) return texto.slice(0, 200);
        return false;
      },
      { timeout: 15000 },
    ).catch(() => null);
    const altaFeedback: string = altaHandle
      ? String(await altaHandle.jsonValue())
      : "sin feedback";
    if (altaFeedback !== "ok") {
      record("Clientes: alta y búsqueda por nombre", false, `feedback: ${String(altaFeedback).slice(0, 160)}`);
      throw new Error("Alta de cliente no confirmada");
    }
    await page.goto(`${BASE_URL}/admin/clientes?q=${clienteNombre}`, { waitUntil: "networkidle0" });
    const clienteListado = await page.evaluate(
      (n) => document.body.innerText.includes(n),
      clienteNombre,
    );
    record("Clientes: alta y búsqueda por nombre", clienteListado);

    await clickText(page, "a", "Editar");
    await page.waitForFunction(
      () => document.body.innerText.includes("Editar cliente"),
      { timeout: 10000 },
    );
    const telefonoNuevo = `56${String(Date.now()).slice(-8)}`;
    await fill("telefono", telefonoNuevo);
    await clickText(page, 'button[type="submit"]', "Guardar cliente");
    await waitPendingClear();
    await sleep(800);
    await page.goto(`${BASE_URL}/admin/clientes?q=${clienteNombre}`, { waitUntil: "networkidle0" });
    const telefonoEditado = await page.evaluate(
      (t) => document.body.innerText.includes(t),
      telefonoNuevo,
    );
    record("Clientes: edición actualiza teléfono", telefonoEditado);

    // ── Ficha técnica del cliente ────────────────────────────────────
    await page.goto(`${BASE_URL}/admin/clientes?q=${clienteNombre}`, { waitUntil: "networkidle0" });
    await clickText(page, "td a", clienteNombre);
    await page.waitForFunction(
      () => document.body.innerText.includes("Fórmulas") && document.body.innerText.includes("Datos"),
      { timeout: 15000 },
    );
    await clickText(page, '[role="tab"]', "Fórmulas");
    await sleep(300);
    const formula = `E2E-${runId} 7.34 + 8.1 (1:1) oxidante 20 vol`;
    // El primer textarea[name=formula] del DOM pertenece a la pestaña Fórmulas
    // (los paneles Base UI quedan montados en orden).
    await setNativeInput(page, 'textarea[name="formula"]', formula);
    await setNativeInput(page, 'input[name="tiempoPoseMinutos"]', "35");
    await clickText(page, 'button[type="submit"]', "Registrar en ficha");
    const fichaOk = await page
      .waitForFunction(
        (f) => document.body.innerText.includes(f) && document.body.innerText.includes("Pose 35 min"),
        { timeout: 15000 },
        formula,
      )
      .then(() => true)
      .catch(() => false);
    record("Clientes: alta en ficha técnica (fórmula)", fichaOk);
    if (fichaOk) {
      await clickText(page, 'button[type="submit"]', "Desactivar");
      const fichaOff = await page
        .waitForFunction((f) => !document.body.innerText.includes(f), { timeout: 15000 }, formula)
        .then(() => true)
        .catch(() => false);
      record("Clientes: desactivar registro de ficha", fichaOff);
    }
    // ── Nota privada del expediente (permiso expedientes.privado) ────
    await clickText(page, '[role="tab"]', "Privado");
    await sleep(300);
    const notaPrivada = `E2E-PRIVADA-${runId} observación confidencial`;
    // El formulario de la pestaña Privado es el último con checkbox privada
    // (los paneles Base UI quedan montados en orden).
    const privadaFilled = await page.evaluate((texto) => {
      const checks = [...document.querySelectorAll('input[name="privada"]')];
      const cb = checks[checks.length - 1];
      if (!(cb instanceof HTMLInputElement)) return false;
      const form = cb.closest("form");
      const area = form?.querySelector('textarea[name="notas"]');
      if (!(area instanceof HTMLTextAreaElement) || !form) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(area, texto);
      area.dispatchEvent(new Event("input", { bubbles: true }));
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, notaPrivada);
    if (!privadaFilled) throw new Error("Formulario de nota privada no encontrado");
    await page.evaluate(() => {
      const checks = [...document.querySelectorAll('input[name="privada"]')];
      (checks[checks.length - 1] as HTMLInputElement | undefined)?.closest("form")?.requestSubmit();
    });
    const privadaOk = await page
      .waitForFunction(
        (n) => document.body.innerText.includes(n) && document.body.innerText.includes("Privada"),
        { timeout: 15000 },
        notaPrivada,
      )
      .then(() => true)
      .catch(() => false);
    record("Clientes: nota privada del expediente", privadaOk);

    // ── Consentimiento informado con firma ────────────────────────────
    await clickText(page, '[role="tab"]', "Consentimientos");
    await sleep(300);
    const consentTitulo = `E2E Consentimiento ${runId}`;
    const consentScope = 'form:has(input[name="firmadoPor"])';
    await setNativeInput(page, 'input[name="titulo"]', consentTitulo, consentScope);
    await setNativeInput(
      page,
      'textarea[name="contenido"]',
      `E2E-${runId} declaro que se me informaron riesgos y cuidados del procedimiento.`,
      consentScope,
    );
    await clickText(page, 'button[type="submit"]', "Registrar consentimiento");
    const consentOk = await page
      .waitForFunction(
        (t) =>
          document.body.innerText.includes(t) &&
          document.body.innerText.includes("Aceptado") &&
          document.body.innerText.includes("Firmado por:"),
        { timeout: 15000 },
        consentTitulo,
      )
      .then(() => true)
      .catch(() => false);
    record("Clientes: consentimiento informado firmado", consentOk);

    await shot(page, "17-clientes");

    // ── Caja: apertura, venta al corte y cierre ciego ─────────────────
    await page.goto(`${BASE_URL}/admin/caja`, { waitUntil: "networkidle0" });
    await setNativeInput(page, 'input[name="fondoInicial"]', "100");
    await setNativeInput(page, 'textarea[name="notas"]', E2E_MARK);
    await clickText(page, 'button[type="submit"]', "Abrir caja");
    const cajaAbierta = await page
      .waitForFunction(() => document.body.innerText.includes("conteo del turno"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    record("Caja: apertura con fondo inicial", cajaAbierta);

    // ── Anticipo: depósito de cita cobrado al turno y aplicado al cobro ──
    // Cita nueva en el segundo slot libre: depósito $100 efectivo entra al
    // corte como entrada; al cobrar, el ticket cobra solo el resto ($200).
    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await crearCita(slots[2], `${E2E_MARK} anticipo`);
    await abrirDetalle(citaNeedle(slots[2]));
    // El encabezado de sección usa text-transform:uppercase → innerText
    // devuelve "ANTICIPOS"; se compara en minúsculas.
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("anticipos"),
      { timeout: 15000 },
    );
    await clickPanel("+ Cobrar anticipo");
    await setNativeInput(page, 'input[aria-label="Monto del anticipo"]', "100");
    await clickPanel("Cobrar anticipo");
    const anticipoVigente = await page
      .waitForFunction(() => document.body.innerText.includes("Vigente"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    record("Anticipo de cita registrado y vigente", anticipoVigente);
    await shot(page, "17a-anticipo");

    // Check-in y cobro: $300 − $100 anticipo → se cobran $200 en efectivo.
    await clickPanel("Cliente llegó");
    await page.waitForFunction(() => document.body.innerText.includes("En proceso"), { timeout: 15000 });
    await abrirCobro();
    const anticipoVisible = await page.evaluate(() =>
      document.body.innerText.includes("Anticipo por aplicar"),
    );
    record("Ticket muestra anticipo por aplicar", anticipoVisible);
    await clickCobrar();
    await esperarResultadoCobro(true);
    await sleep(600);
    const sheetCerroAnticipo = await page.evaluate(
      () => !document.body.innerText.includes("Cobro de la cita"),
    );
    record("Cobro con anticipo aplicado cierra el sheet (resto $200)", sheetCerroAnticipo);
    await shot(page, "17b-anticipo-cobro");

    // Venta walk-in en efectivo ($300) para que caiga en el corte abierto.
    await page.goto(`${BASE_URL}/admin/pos`, { waitUntil: "networkidle0" });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await agregarAlTicket("Servicios", "CORTE DE DAMA");

    // Promoción vigente del catálogo (10% sobre todo): $300 → $270.
    await pickCombobox(page, "Promoción vigente", `E2E Promo ${runId}`);
    await clickText(page, 'button[type="submit"]', "Aplicar promoción");
    await waitPendingClear();
    const promoAplicada = await page
      .waitForFunction(() => document.body.innerText.includes("$270.00"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    record("Promoción vigente aplicada al ticket (10% = $270)", promoAplicada);
    await shot(page, "17c-promocion");

    await page.evaluate(() => {
      const grupo = document.querySelector('[role="group"][aria-label="Medio del pago 1"]');
      const chip = Array.from(grupo?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.toUpperCase().includes("EFECTIVO"),
      );
      chip?.click();
    });
    await sleep(300);
    await clickText(page, 'button[type="submit"]', "Cobrar");
    await esperarResultadoCobro(false);

    // ── Paquete prepagado: compra ($800) a nombre del cliente E2E ────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await pickCombobox(page, "Cliente de la venta", clienteNombre);
    const clienteAsignado = await page
      .waitForFunction((n) => document.body.innerText.includes(`Cliente: ${n}`), { timeout: 15000 }, clienteNombre)
      .then(() => true)
      .catch(() => false);
    record("POS: cliente asignado a venta walk-in", clienteAsignado);
    await agregarAlTicket("Paquetes", paqueteNombre);
    await page.evaluate(() => {
      const grupo = document.querySelector('[role="group"][aria-label="Medio del pago 1"]');
      const chip = Array.from(grupo?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.toUpperCase().includes("EFECTIVO"),
      );
      chip?.click();
    });
    await sleep(300);
    await clickText(page, 'button[type="submit"]', "Cobrar");
    await esperarResultadoCobro(false);
    const ventaPaqueteOk = await page.evaluate(
      () => location.pathname === "/admin/pos" && !location.search.includes("ventaId"),
    );
    record("POS: paquete vendido al cliente (cobro $800)", ventaPaqueteOk);

    // Segunda venta del mismo cliente: la sesión de paquete cubre el servicio.
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await pickCombobox(page, "Cliente de la venta", clienteNombre);
    await page.waitForFunction((n) => document.body.innerText.includes(`Cliente: ${n}`), { timeout: 15000 }, clienteNombre);
    await agregarAlTicket("Servicios", "CORTE DE DAMA");
    const usoClick = await page
      .waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) =>
            b.textContent?.includes("Usar paquete"),
          );
          if (!btn) return false;
          btn.click();
          return true;
        },
        { timeout: 15000, polling: 250 },
      )
      .then(() => true)
      .catch(() => false);
    const cubiertoPorPaquete = await page
      .waitForFunction(
        () => document.body.innerText.toLowerCase().includes("cubierto por paquete"),
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Paquete: sesión consumida cubre el servicio (total $0)", usoClick && cubiertoPorPaquete);
    await shot(page, "17d-paquete");
    await clickText(page, 'button[type="submit"]', "Completar venta");
    await esperarResultadoCobro(false);

    // ── Membresía: compra ($500) a nombre del cliente E2E ──────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await pickCombobox(page, "Cliente de la venta", clienteNombre);
    await page.waitForFunction((n) => document.body.innerText.includes(`Cliente: ${n}`), { timeout: 15000 }, clienteNombre);
    await agregarAlTicket("Membresías", membresiaNombre);
    await page.evaluate(() => {
      const grupo = document.querySelector('[role="group"][aria-label="Medio del pago 1"]');
      const chip = Array.from(grupo?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.toUpperCase().includes("EFECTIVO"),
      );
      chip?.click();
    });
    await sleep(300);
    await clickText(page, 'button[type="submit"]', "Cobrar");
    await esperarResultadoCobro(false);
    const ventaMembresiaOk = await page.evaluate(
      () => location.pathname === "/admin/pos" && !location.search.includes("ventaId"),
    );
    record("POS: membresía vendida al cliente (cobro $500)", ventaMembresiaOk);

    // Membresía vencida del cliente (vigencia pasada, ligada a la venta de
    // compra): NO debe aparecer en el selector del ticket.
    await withDb(async (client) => {
      await client.query(
        `insert into cliente_membresias (organizacion_id, sucursal_id, cliente_id, membresia_id, venta_id, vigencia_desde, vigencia_hasta, estado, created_by)
         select v.organizacion_id, v.sucursal_id, v.cliente_id, m.id, v.id, '2020-01-01', '2020-01-31', 'vigente', $3
         from ventas v
         join detalle_ventas_membresias d on d.venta_id = v.id and d.activo
         join membresias m on m.organizacion_id = v.organizacion_id and m.clave = $2
         where v.organizacion_id = $1
         order by v.created_at desc
         limit 1`,
        [ctx.orgId, `E2EMEMV${runId}`, ctx.adminId],
      );
    });

    // ── Venta con descuento de membresía: servicio $300 − 10% = $270 ────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForTextReload(page, "Agregar al ticket");
    await pickCombobox(page, "Cliente de la venta", clienteNombre);
    await page.waitForFunction((n) => document.body.innerText.includes(`Cliente: ${n}`), { timeout: 15000 }, clienteNombre);
    await agregarAlTicket("Servicios", "CORTE DE DAMA");

    // El selector "Membresía vigente" solo lista la membresía vigente: la
    // vencida (vigencia 2020) queda fuera aunque su estado sea "vigente".
    const membresiaInputId = await page.evaluate(() => {
      const lab = Array.from(document.querySelectorAll("label")).find((l) =>
        l.textContent?.toLowerCase().includes("membresía vigente"),
      );
      return lab?.htmlFor ?? null;
    });
    if (!membresiaInputId) throw new Error("Combobox 'Membresía vigente' no renderizó");
    const membresiaSelector = `[id="${membresiaInputId.replace(/"/g, '\\"')}"]`;
    await page.click(membresiaSelector);
    // La lista de opciones abre al escribir: "E2E" matchea ambas membresías.
    await page.type(membresiaSelector, "E2E");
    await page.waitForSelector('[role="option"]', { visible: true, timeout: 8000 });
    const opcionesMembresia = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent ?? ""),
    );
    const sinVencida = !opcionesMembresia.some((o) => o.includes("Vencida"));
    const conVigente = opcionesMembresia.some((o) => o.includes(membresiaNombre));
    record("Membresía: selector solo muestra vigentes (vencida fuera)", sinVencida && conVigente);
    await page.evaluate((n) => {
      const opt = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
        o.textContent?.includes(n),
      );
      opt?.click();
    }, membresiaNombre);
    await clickText(page, 'button[type="submit"]', "Aplicar membresía");
    const descuentoMembresia = await page
      .waitForFunction(
        () => document.body.innerText.includes("Membresía ·"),
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Membresía: descuento 10% aplicado al ticket (−$30)", descuentoMembresia);
    await shot(page, "17e-membresia");
    await page.evaluate(() => {
      const grupo = document.querySelector('[role="group"][aria-label="Medio del pago 1"]');
      const chip = Array.from(grupo?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.toUpperCase().includes("EFECTIVO"),
      );
      chip?.click();
    });
    await sleep(300);
    await clickText(page, 'button[type="submit"]', "Cobrar");
    await esperarResultadoCobro(false);
    const ventaConMembresiaOk = await page.evaluate(
      () => location.pathname === "/admin/pos" && !location.search.includes("ventaId"),
    );
    record("POS: venta cobrada con descuento de membresía ($270)", ventaConMembresiaOk);

    // Cierre ciego: efectivo contado = fondo $100 + anticipo $100 + venta con
    // anticipo $200 + venta walk-in con promoción $270 + paquete $800 +
    // membresía $500 + venta con membresía $270 = $2240.
    await page.goto(`${BASE_URL}/admin/caja`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[name^="contado_"]'))) {
        const label = input.closest("div")?.querySelector("label")?.textContent ?? "";
        setter.call(input, label.toUpperCase().includes("EFECTIVO") ? "2240" : "0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await clickText(page, 'button[type="submit"]', "Confirmar cierre de caja");
    const cierreOk = await page
      .waitForFunction(
        () => document.body.innerText.includes("Cortes recientes") && document.body.innerText.includes("Cuadrado"),
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Caja: cierre ciego cuadra (fondo + venta en efectivo)", cierreOk);
    await shot(page, "18-caja");

    // ── Reportes: operativos y financieros del día ────────────────────
    // El rango por defecto (últimos 30 días) incluye todas las ventas del run.
    await page.goto(`${BASE_URL}/admin/reportes`, { waitUntil: "networkidle0" });
    // Los KPI usan text-transform:uppercase → innerText llega en mayúsculas;
    // se compara todo en minúsculas.
    const reportesOk = await page
      .waitForFunction(
        () => {
          const texto = document.body.innerText.toLowerCase();
          return (
            texto.includes("citas por estado") &&
            texto.includes("ventas por día") &&
            texto.includes("cobros por medio de pago") &&
            texto.includes("asistencia")
          );
        },
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Reportes: secciones operativas y financieras", reportesOk);
    const reportesData = await page.evaluate(
      (hoy) => document.body.innerText.includes(hoy),
      fecha,
    );
    record("Reportes: ventas del día en el rango por defecto", reportesData);
    await shot(page, "19-reportes");

    // ── PWA: manifest, iconos, service worker y fallback offline ──────
    const manifest = await page.evaluate(async () => {
      const res = await fetch("/manifest.webmanifest");
      return res.ok ? res.json() : null;
    });
    const manifestOk = Boolean(
      manifest?.display === "standalone" &&
        manifest?.start_url === "/admin" &&
        Array.isArray(manifest?.icons) &&
        manifest.icons.some((icon: { sizes?: string }) => icon.sizes === "512x512"),
    );
    record("PWA: manifest instalable (standalone + icono 512)", manifestOk);

    const assetsOk = await page.evaluate(async () => {
      const [icon, apple, sw] = await Promise.all([
        fetch("/icon.png"),
        fetch("/apple-icon.png"),
        fetch("/sw.js"),
      ]);
      return (
        icon.ok && icon.headers.get("content-type")?.includes("image/png") &&
        apple.ok && sw.ok && sw.headers.get("content-type")?.includes("javascript")
      );
    });
    record("PWA: iconos generados + sw.js servido", Boolean(assetsOk));

    await page.goto(`${BASE_URL}/offline`, { waitUntil: "networkidle0" });
    const offlineOk = await page
      .waitForFunction(() => document.body.innerText.includes("Sin conexión"), { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    record("PWA: página offline renderiza", offlineOk);
    await shot(page, "20-pwa");

    // ── Offline transaccional: caché de catálogo, encolar y sincronizar ──
    // Abrir un ticket en línea escribe el catálogo en IndexedDB.
    await page.goto(ventaWalkinUrl, { waitUntil: "networkidle0" });
    const catalogoOfflineOk = await page
      .waitForFunction(
        () =>
          new Promise<boolean>((resolve) => {
            const req = indexedDB.open("beauty-pos-offline");
            req.onsuccess = () => {
              const q = req.result.transaction("catalogo").objectStore("catalogo").getAll();
              q.onsuccess = () => resolve((q.result as unknown[]).length > 0);
              q.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          }),
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Offline: catálogo guardado en IndexedDB al visitar POS", catalogoOfflineOk);

    await page.goto(`${BASE_URL}/offline/venta`, { waitUntil: "networkidle0" });
    const ticketOfflineOk = await page
      .waitForFunction(
        (nombre) => document.body.innerText.includes(nombre),
        { timeout: 15000 },
        `E2E Producto ${runId}`,
      )
      .then(() => true)
      .catch(() => false);
    record("Offline: ticket sin conexión renderiza catálogo", ticketOfflineOk);

    await page.setOfflineMode(true);
    await clickText(page, "button", `E2E Producto ${runId}`);
    await page.type('input[aria-label="Nota de la venta"]', `E2E-SMOKE offline ${runId}`);
    const medioEfectivoId = await page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Medio de pago"]');
      const opt = sel ? Array.from(sel.options).find((o) => o.text.toLowerCase().includes("efectivo")) : null;
      return opt?.value ?? null;
    });
    if (medioEfectivoId) await page.select('select[aria-label="Medio de pago"]', medioEfectivoId);
    await page.type('input[aria-label="Monto"]', "25");
    await clickText(page, "button", "Registrar venta");
    const encoladaOk = await page
      .waitForFunction(() => document.body.innerText.includes("Por sincronizar (1)"), { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    record("Offline: venta encolada sin conexión", encoladaOk);

    await page.setOfflineMode(false);
    const sincronizadaOk = await page
      .waitForFunction(
        () =>
          document.body.innerText.includes("Por sincronizar (0)") ||
          document.body.innerText.toLowerCase().includes("sincronizad"),
        { timeout: 25000 },
      )
      .then(() => true)
      .catch(() => false);
    record("Offline: venta sincronizada al recuperar conexión", sincronizadaOk);

    const ventaOfflineRows = await withDb(async (client) => {
      const { rows } = await client.query(
        `select estado, total::float8 as total from ventas
         where organizacion_id = $1 and notas ilike '%E2E-SMOKE offline%' and activo`,
        [ctx.orgId],
      );
      return rows as { estado: string; total: number }[];
    });
    record(
      "Offline: venta completada en BD (una sola, sin duplicar)",
      ventaOfflineRows.length === 1 && ventaOfflineRows[0].estado === "completada" && Number(ventaOfflineRows[0].total) === 25,
    );
    await shot(page, "21-offline-venta");
  } catch (error) {
    record("Flujo interrumpido", false, error instanceof Error ? error.message : String(error));
    await shot(page, "99-error");
  }

  const fallidos = results.filter((r) => !r.ok);
  console.log(`\n=== Resumen: ${results.length - fallidos.length}/${results.length} pasos OK ===`);
  if (consoleErrors.length > 0) {
    console.log("\n--- Errores de consola ---");
    for (const err of Array.from(new Set(consoleErrors)).slice(0, 10)) console.log(`  ${err.slice(0, 300)}`);
  } else {
    console.log("Sin errores de consola.");
  }
  await browser.close();
  if (fallidos.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
