import "dotenv/config";

import puppeteer, { type Page } from "puppeteer";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const OUT_DIR = ".smoke-shots/flows";
const TIME_ZONE = "America/Mexico_City";

if (!EMAIL || !PASSWORD) {
  console.error("Faltan BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD en .env");
  process.exit(1);
}
const email = EMAIL as string;
const password = PASSWORD as string;

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
 * Resuelve la misma organización y sucursal por defecto que `getAdminContext`:
 * primera org accesible por nombre → primera sucursal activa por nombre.
 */
async function resolveContext(): Promise<E2EContext> {
  return withDb(async (client) => {
    const { rows } = await client.query(
      `with u as (
         select id, es_administrador_plataforma as plataforma
         from usuarios where correo = $1
       ),
       o as (
         select org.id, org.zona_horaria
         from organizaciones org
         where (select plataforma from u)
            or exists (
              select 1 from miembros_organizaciones mo, u
              where mo.organizacion_id = org.id
                and mo.usuario_id = u.id and mo.estado = 'activo'
            )
         order by org.nombre limit 1
       ),
       b as (
         select s.id, coalesce(s.zona_horaria, o.zona_horaria) as tz
         from sucursales s join o on o.id = s.organizacion_id
         where s.activo
         order by s.nombre limit 1
       )
       select (select id from u) as admin_id,
              (select id from o) as org_id,
              (select id from b) as branch_id,
              coalesce((select tz from b), $2) as tz`,
      [email, TIME_ZONE],
    );
    const row = rows[0] ?? {};
    if (!row.org_id || !row.branch_id) {
      throw new Error("No se pudo resolver organización/sucursal por defecto para E2E");
    }
    return { orgId: row.org_id, branchId: row.branch_id, adminId: row.admin_id, timeZone: row.tz };
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
       )`,
      [ctx.orgId, E2E_NOTAS],
    );
    await client.query(
      `update citas set activo = false
       where organizacion_id = $1 and notas ilike $2`,
      [ctx.orgId, E2E_NOTAS],
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
    // Horarios libres reales: la cita inicial, el destino de "Mover", la
    // segunda cita y el destino de "Reagendar" nunca chocan con datos
    // preexistentes ni entre sí.
    const slots = await findFreeSlots(ctx, fecha, 4);
    console.log(`Horarios E2E (${ctx.timeZone}): ${slots.join(", ")}`);

    // ── Login ────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });
    await page.type('input[name="email"]', email);
    await page.type('input[name="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);
    record("Login redirige a /admin", page.url().includes("/admin"));

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
        { timeout: 15000 },
      );
    };

    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await crearCita(slots[0], E2E_MARK);
    await waitForText(page, "Walk-in");
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
    const cardAria = (estado: string, extra?: string) =>
      page.evaluate(
        ([e, x]) =>
          Array.from(document.querySelectorAll("button[aria-label]")).some((b) => {
            const label = (b.getAttribute("aria-label") ?? "").toLowerCase();
            return label.startsWith(e) && (!x || label.includes(x));
          }),
        [estado, extra ?? ""],
      );

    await abrirDetalle("Walk-in");
    await clickPanel("Mover");
    await page.waitForSelector('[role="dialog"] input[type="time"]', { visible: true });
    await setNativeInput(page, '[role="dialog"] input[type="time"]', slots[1]);
    await shot(page, "03-mover-cita");
    await clickText(page, '[role="dialog"] button[type="submit"]', "Mover cita");
    await sleep(1500);
    await page.reload({ waitUntil: "networkidle0" });
    await waitForText(page, "Walk-in");
    record(`Mover cita a las ${slots[1]} (sin drag)`, await cardAria("pendiente", hora12(slots[1])));

    // ── Agenda: transición de estado ──────────────────────────────────────
    await abrirDetalle("Walk-in");
    await clickPanel("Confirmar");
    await sleep(1500);
    await page.reload({ waitUntil: "networkidle0" });
    record("Transición pendiente → confirmada", await cardAria("confirmada"));

    // ── Agenda → cobro inline: el panel abre el CheckoutSheet ─────────────
    const waitPendingClear = () =>
      page.waitForFunction(
        () => {
          const busy = ["agregando", "cobrando", "guardando", "registrando", "aplicando", "moviendo"];
          return !Array.from(document.querySelectorAll("button")).some((b) =>
            busy.some((t) => b.textContent?.toLowerCase().includes(t)),
          );
        },
        { timeout: 20000 },
      );
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
    const agregarAlTicket = async (tab: "Servicios" | "Productos", nombre: string) => {
      for (let intento = 0; intento < 3; intento++) {
        await clickText(page, '[role="group"][aria-label="Tipo de catálogo"] button', tab);
        await sleep(300);
        const ok = await page.evaluate((n) => {
          const btn = document.querySelector<HTMLElement>(`button[aria-label="Agregar ${n} al ticket"]`);
          if (!btn) return false;
          btn.click();
          return true;
        }, nombre);
        if (!ok) throw new Error(`Tarjeta de catálogo no encontrada: ${nombre}`);
        const aparecio = await page
          .waitForSelector(`[aria-label="Cantidad de ${nombre}"]`, { visible: true, timeout: 10000 })
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

    await abrirDetalle("confirmada");
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
    await abrirDetalle("en proceso");
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
    await sleep(1500);
    const notasRequeridas = await page.evaluate(() =>
      document.body.innerText.toLowerCase().includes("motivo"),
    );
    record("Salida sin notas rechazada", notasRequeridas);

    // ── Cobro inline con stock: cierra el sheet y completa la cita ────────
    await page.goto(`${BASE_URL}/admin/agenda`, { waitUntil: "networkidle0" });
    await abrirDetalle("en proceso");
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
    await waitForText(page, "Agregar al ticket");
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

    // ── POS: descuento en ticket ──────────────────────────────────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForText(page, "Agregar al ticket");
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
    await waitForText(page, "Walk-in");
    await abrirDetalle("pendiente");
    await clickPanel("Editar");
    await page.waitForSelector('[role="dialog"] textarea[name="notas"]', { visible: true });
    await setNativeInput(page, '[role="dialog"] textarea[name="notas"]', "E2E-SMOKE editada");
    await clickText(page, '[role="dialog"] button[type="submit"]', "Guardar cambios");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 15000 });
    await page.reload({ waitUntil: "networkidle0" });
    await abrirDetalle("pendiente");
    const notaEditada = await page.evaluate(() => document.body.innerText.includes("E2E-SMOKE editada"));
    record("Editar cita actualiza las notas", notaEditada);

    // ── Agenda: cancelar y reagendar ──────────────────────────────────────
    await clickPanel("Cancelar cita");
    await page.waitForSelector('[role="alertdialog"]', { visible: true });
    await clickText(page, '[role="alertdialog"] button', "Cancelar cita");
    await sleep(1500);
    await page.reload({ waitUntil: "networkidle0" });
    record("Cancelar cita cambia el estado", await cardAria("cancelada"));

    await abrirDetalle("cancelada");
    await clickPanel("Reagendar");
    await page.waitForSelector('[role="dialog"] input[type="time"]', { visible: true });
    await setNativeInput(page, '[role="dialog"] input[type="time"]', slots[3]);
    await clickText(page, '[role="dialog"] button[type="submit"]', "Reagendar");
    await sleep(1500);
    await page.reload({ waitUntil: "networkidle0" });
    record(
      `Reagendar rescata cita cancelada → pendiente ${slots[3]}`,
      await cardAria("pendiente", hora12(slots[3])),
    );
    await shot(page, "12-cita-reagendada");

    // ── Agenda: vistas semana y lista interactivas ────────────────────────
    await page.goto(`${BASE_URL}/admin/agenda?vista=semana`, { waitUntil: "networkidle0" });
    await abrirDetalle("pendiente");
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
    const miDiaCita = await page.evaluate(() => document.body.innerText.includes("Walk-in"));
    record("Mi día lista la cita asignada al usuario", miDiaCita);
    const tabBarOk = await page.evaluate(
      () => Boolean(document.querySelector('nav[aria-label="Accesos rápidos"]')),
    );
    record("Tab bar móvil presente en el shell", tabBarOk);
    await shot(page, "15-mi-dia");

    await clickText(page, "button", "Cliente en silla");
    await page.reload({ waitUntil: "networkidle0" });
    const checkInOk = await page.evaluate(() => document.body.innerText.includes("En proceso"));
    record("Mi día: check-in pasa la cita a en proceso", checkInOk);

    await clickText(page, "button", "Cobrar");
    await page.waitForFunction(
      () => location.pathname === "/admin/pos" && location.search.includes("ventaId"),
      { timeout: 20000 },
    );
    await waitForText(page, "Agregar al ticket");
    const vuelveMiDia = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).some((a) =>
        (a.getAttribute("href") ?? "").includes("/admin/mi-dia"),
      ),
    );
    record("Mi día: Cobrar abre ticket POS con returnTo", vuelveMiDia);
    await shot(page, "16-mi-dia-cobro");

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

    // Venta walk-in en efectivo ($300) para que caiga en el corte abierto.
    await page.goto(`${BASE_URL}/admin/pos`, { waitUntil: "networkidle0" });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }),
      clickText(page, 'button[type="submit"]', "Abrir venta"),
    ]);
    await waitForText(page, "Agregar al ticket");
    await agregarAlTicket("Servicios", "CORTE DE DAMA");
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

    // Cierre ciego: efectivo contado = fondo $100 + venta $300 = $400.
    await page.goto(`${BASE_URL}/admin/caja`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[name^="contado_"]'))) {
        const label = input.closest("div")?.querySelector("label")?.textContent ?? "";
        setter.call(input, label.toUpperCase().includes("EFECTIVO") ? "400" : "0");
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
