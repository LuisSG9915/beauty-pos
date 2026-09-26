/**
 * Simulación de carga con cuatro perfiles de negocio contra el entorno
 * `SMOKE_BASE_URL` (default http://localhost:3000, producción: melena.app).
 *
 * Perfiles:
 *   config   Negocio configurando su catálogo en vivo: lectores HTTP de las
 *            páginas de catálogo + escritor que inserta/actualiza/borra
 *            servicios y productos `sim_*` directo en BD (contención real en
 *            Cockroach). Limpia sus filas al terminar.
 *   alta     Temporada alta: 14 usuarios concurrentes, mezcla operativa
 *            (agenda/pos/mi-dia/caja/ventas/clientes + búsqueda remota +
 *            telemetría), think time corto.
 *   baja     Temporada baja: 2 usuarios, think time largo, lecturas simples.
 *   normal   Temporada normal: 6 usuarios, mezcla moderada.
 *
 * Uso:
 *   SMOKE_BASE_URL=https://melena.app pnpm tsx scripts/load-sim.ts
 *     --phase=alta|baja|normal|config|todas   --duration=60   --json
 *
 * Medición del Worker: correr las fases, luego consultar Workers Observability
 * (cpuTime/wallTime por invocación) en la ventana del run — el reporte imprime
 * la ventana exacta al final.
 */
import { randomBytes } from "node:crypto";

import { and, eq, like, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { productos, servicios } from "@/db/schema/catalogs";
import { checkFlags } from "./lib/cli";
import { BASE_URL, E2E_EMAIL, sessionCookieHeader } from "./lib/e2e";
import { writeArtifact } from "./lib/report";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pickWeighted = <T>(items: readonly (readonly [T, number])[]): T => {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
};

type Sample = { ms: number; ok: boolean; status: number; kind: string };

type RouteDef =
  | { kind: "page"; path: string }
  | { kind: "api-clientes"; q: string }
  | { kind: "telemetria" };

type PhaseDef = {
  nombre: string;
  descripcion: string;
  usuarios: number;
  thinkMs: [number, number];
  rutas: readonly (readonly [RouteDef, number])[];
};

function buildPhases(orgId: string): Record<string, PhaseDef> {
  const p = (path: string): RouteDef => ({ kind: "page", path: `${path}?organizationId=${orgId}` });
  return {
    config: {
      nombre: "Configurando catálogo en vivo",
      descripcion: "3 lectores de catálogo + escritor DB (servicios/productos sim_*)",
      usuarios: 3,
      thinkMs: [800, 2000],
      rutas: [
        [p("/admin/servicios"), 30],
        [p("/admin/productos"), 25],
        [p("/admin/inventario"), 20],
        [p("/admin/categorias-servicios"), 10],
        [p("/admin/categorias-productos"), 10],
        [p("/admin"), 5],
      ],
    },
    alta: {
      nombre: "Temporada alta",
      descripcion: "14 usuarios, mezcla operativa completa + búsqueda + telemetría",
      usuarios: 14,
      thinkMs: [200, 700],
      rutas: [
        [p("/admin/agenda"), 26],
        [p("/admin/pos"), 20],
        [p("/admin/mi-dia"), 14],
        [p("/admin/caja"), 10],
        [p("/admin/ventas"), 10],
        [p("/admin/clientes"), 8],
        [p("/admin"), 5],
        [{ kind: "api-clientes", q: "ma" }, 5],
        [{ kind: "telemetria" }, 2],
      ],
    },
    baja: {
      nombre: "Temporada baja",
      descripcion: "2 usuarios, pocas lecturas, think time largo",
      usuarios: 2,
      thinkMs: [3000, 6000],
      rutas: [
        [p("/admin/agenda"), 50],
        [p("/admin"), 30],
        [p("/admin/mi-dia"), 20],
      ],
    },
    normal: {
      nombre: "Temporada normal",
      descripcion: "6 usuarios, mezcla moderada",
      usuarios: 6,
      thinkMs: [900, 2200],
      rutas: [
        [p("/admin/agenda"), 30],
        [p("/admin/pos"), 18],
        [p("/admin/mi-dia"), 15],
        [p("/admin/clientes"), 12],
        [p("/admin/ventas"), 8],
        [p("/admin"), 10],
        [{ kind: "api-clientes", q: "lu" }, 4],
        [{ kind: "telemetria" }, 3],
      ],
    },
  };
}

const stats = (samples: Sample[]) => {
  const lat = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0);
  return {
    n: samples.length,
    errores: samples.filter((s) => !s.ok).length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: lat[lat.length - 1] ?? 0,
  };
};

async function resolveE2eOrg(email: string): Promise<string> {
  const db = getDatabase();
  const res = await db.execute(sql`
    select m.organizacion_id as id
    from miembros_organizaciones m
    join usuarios u on u.id = m.usuario_id
    join auth."user" au on au.id = u.auth_usuario_id
    where au.email = ${email} and m.estado = 'activo'
    order by m.created_at limit 1`);
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) throw new Error(`La cuenta ${email} no tiene organización activa`);
  return row.id;
}

async function fetchRoute(route: RouteDef, cookie: string, orgId: string, sid: string): Promise<Sample> {
  const t0 = performance.now();
  try {
    let res: Response;
    if (route.kind === "page") {
      res = await fetch(`${BASE_URL}${route.path}`, {
        headers: { Cookie: cookie },
        redirect: "manual",
      });
    } else if (route.kind === "api-clientes") {
      res = await fetch(`${BASE_URL}/api/clientes?organizationId=${orgId}&q=${route.q}`, {
        headers: { Cookie: cookie },
      });
    } else {
      res = await fetch(`${BASE_URL}/api/telemetria/producto`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          sesion: {
            sid,
            iniciaAt: Date.now() - 60_000,
            paginas: 3,
            acciones: 5,
            accionesClave: 1,
            tiempoActivoMs: 45_000,
            entradaRuta: "/admin",
            organizacionId: orgId,
            dispositivo: "desktop",
            navegador: "load-sim",
          },
          eventos: [
            { tipo: "page_view", ruta: "/admin", clientAt: Date.now() },
            { tipo: "action", ruta: "/admin", actionId: "sim.carga", clientAt: Date.now() },
          ],
        }),
      });
    }
    const ms = performance.now() - t0;
    // 302 → login cuenta como fallo: sesión perdida o auth roto.
    const ok = res.status >= 200 && res.status < 300;
    await res.arrayBuffer().catch(() => {});
    return { ms, ok, status: res.status, kind: route.kind };
  } catch {
    return { ms: performance.now() - t0, ok: false, status: 0, kind: route.kind };
  }
}

async function runUser(
  phase: PhaseDef,
  cookie: string,
  orgId: string,
  durMs: number,
  out: Sample[],
): Promise<void> {
  const sid = `sim-${randomBytes(6).toString("hex")}`;
  const deadline = Date.now() + durMs;
  while (Date.now() < deadline) {
    const route = pickWeighted(phase.rutas);
    const sample = await fetchRoute(route, cookie, orgId, sid);
    out.push(sample);
    const rest = deadline - Date.now();
    if (rest <= 0) break;
    await sleep(Math.min(rest, rand(...phase.thinkMs)));
  }
}

/** Escritor de catálogo: inserta/actualiza/borra filas `sim_*` en el org e2e. */
async function runCatalogWriter(orgId: string, durMs: number): Promise<{ escrituras: number; errores: number }> {
  const db = getDatabase();
  const deadline = Date.now() + durMs;
  let escrituras = 0;
  let errores = 0;
  const nombresServicios = ["Corte SIM", "Tinte SIM", "Manicure SIM", "Facial SIM", "Peinado SIM", "Masaje SIM"];
  const nombresProductos = ["Shampoo SIM", "Tinte caja SIM", "Esmalte SIM", "Cera SIM", "Spray SIM"];
  let i = 0;
  while (Date.now() < deadline) {
    i += 1;
    const clave = `sim_${(i % 12).toString().padStart(2, "0")}`;
    try {
      if (i % 2 === 0) {
        await db
          .insert(servicios)
          .values({
            organizacionId: orgId,
            clave,
            nombre: `${nombresServicios[i % nombresServicios.length]} ${i}`,
            duracionMinutos: 30 + (i % 4) * 15,
            precioBase: String(150 + (i % 10) * 20),
          })
          .onConflictDoUpdate({
            target: [servicios.organizacionId, servicios.clave],
            set: { nombre: `${clave} upd ${i}`, precioBase: String(150 + (i % 10) * 20) },
          });
      } else {
        await db
          .insert(productos)
          .values({
            organizacionId: orgId,
            sku: clave,
            nombre: `${nombresProductos[i % nombresProductos.length]} ${i}`,
            precioVenta: String(80 + (i % 10) * 15),
            costo: String(40 + (i % 10) * 7),
          })
          .onConflictDoUpdate({
            target: [productos.organizacionId, productos.sku],
            set: { precioVenta: String(80 + (i % 10) * 15) },
          });
      }
      escrituras += 1;
    } catch {
      errores += 1;
    }
    await sleep(rand(600, 1800));
  }
  return { escrituras, errores };
}

async function limpiarSim(orgId: string) {
  const db = getDatabase();
  await db.delete(servicios).where(and(eq(servicios.organizacionId, orgId), like(servicios.clave, "sim_%")));
  await db.delete(productos).where(and(eq(productos.organizacionId, orgId), like(productos.sku, "sim_%")));
}

async function main() {
  const flags = checkFlags();
  const phaseArg = flags.only.length > 0 ? flags.only.join(",") : "todas";
  const durMs = Number(process.env.LOAD_DURATION_MS ?? 60_000);
  const orgId = await resolveE2eOrg(E2E_EMAIL);
  const cookie = await sessionCookieHeader(E2E_EMAIL);
  const phases = buildPhases(orgId);
  const toRun = Object.entries(phases).filter(([k]) => phaseArg === "todas" || phaseArg.split(",").includes(k));
  if (toRun.length === 0) throw new Error(`Fase desconocida: ${phaseArg}`);

  console.log(`Base: ${BASE_URL} · org ${orgId} · ${durMs / 1000}s por fase`);
  const ventanaInicio = new Date();
  const reporte: Record<string, unknown> = { baseUrl: BASE_URL, orgId, durMs, inicio: ventanaInicio.toISOString(), fases: [] };

  await limpiarSim(orgId);
  for (const [clave, phase] of toRun) {
    console.log(`\n=== ${clave}: ${phase.nombre} (${phase.usuarios} usuarios) ===`);
    const samples: Sample[] = [];
    const workers = Array.from({ length: phase.usuarios }, () => runUser(phase, cookie, orgId, durMs, samples));
    const writer = clave === "config" ? runCatalogWriter(orgId, durMs) : Promise.resolve(null);
    const [, writerRes] = await Promise.all([Promise.all(workers), writer]);

    const s = stats(samples);
    const porKind = Object.fromEntries(
      [...new Set(samples.map((x) => x.kind))].map((k) => [k, stats(samples.filter((x) => x.kind === k))]),
    );
    const rps = s.n / (durMs / 1000);
    console.log(
      `req=${s.n} err=${s.errores} rps=${rps.toFixed(1)} | p50=${s.p50.toFixed(0)}ms p95=${s.p95.toFixed(0)}ms p99=${s.p99.toFixed(0)}ms max=${s.max.toFixed(0)}ms`,
    );
    if (writerRes) console.log(`escrituras catálogo=${writerRes.escrituras} errores=${writerRes.errores}`);
    (reporte.fases as unknown[]).push({ clave, ...s, rps, porKind, escritor: writerRes });
  }
  await limpiarSim(orgId);

  const ventanaFin = new Date();
  console.log(`\nVentana del run (UTC): ${ventanaInicio.toISOString()} → ${ventanaFin.toISOString()}`);
  console.log("Consulta Workers Observability en esa ventana para cpuTime/wallTime por invocación.");
  if (flags.json) writeArtifact("load-sim", reporte);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
