/**
 * Benchmark de carga progresiva contra producción.
 *
 * Simula `N` usuarios concurrentes navegando las rutas admin (solo lectura)
 * con la sesión de la cuenta E2E. Cada usuario virtual repite:
 * elegir ruta (ponderada por uso real) → GET → think-time 300–800 ms.
 *
 * No crea ni modifica datos: son GET de páginas. La sesión es la misma para
 * todos los usuarios virtuales (una sola cuenta E2E), lo que evita resets de
 * contraseña concurrentes y refleja el peor caso de una cuenta compartida.
 *
 * Seguridad: el escalón se aborta si el error rate supera el umbral o si hay
 * ráfaga de timeouts; el run completo se detiene tras el primer escalón
 * abortado.
 *
 * Uso:
 *   SMOKE_BASE_URL=https://melena.app \
 *   pnpm tsx scripts/load-bench.ts
 *
 * Opcional: LOAD_LEVELS="1,3" LOAD_SECONDS=30 para corridas cortas.
 */
import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";

import { BASE_URL, E2E_EMAIL, sessionCookie } from "./lib/e2e";

const LEVELS = (process.env.LOAD_LEVELS ?? "1,3,5,10,15")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const LEVEL_SECONDS = Number(process.env.LOAD_SECONDS ?? 45);
const REQUEST_TIMEOUT_MS = 30_000;
const ERROR_RATE_ABORT = 0.1; // >10% de errores tras ≥30 requests → abortar
const TIMEOUT_RATE_ABORT = 0.1; // >10% timeouts → abortar

// Ponderación aproximada del uso real: el panel y la agenda son lo más
// visitado; reportes/config son ocasionales.
const ROUTES: Array<{ path: string; peso: number }> = [
  { path: "/admin", peso: 3 },
  { path: "/admin/agenda", peso: 3 },
  { path: "/admin/pos", peso: 2 },
  { path: "/admin/caja", peso: 2 },
  { path: "/admin/clientes", peso: 2 },
  { path: "/admin/mi-dia", peso: 2 },
  { path: "/admin/inventario", peso: 1 },
  { path: "/admin/reportes", peso: 1 },
  { path: "/admin/sucursales", peso: 1 },
];

type Sample = { ms: number; status: number; path: string; timeout: boolean };
type LevelResult = {
  nivel: number;
  inicioIso: string;
  finIso: string;
  duracionS: number;
  total: number;
  ok: number;
  errores: number;
  timeouts: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
  statuses: Record<string, number>;
  porRuta: Record<string, number>;
  abortado: boolean;
  motivo?: string;
};

function pickPath(): string {
  const total = ROUTES.reduce((s, r) => s + r.peso, 0);
  let roll = Math.random() * total;
  for (const r of ROUTES) {
    roll -= r.peso;
    if (roll <= 0) return r.path;
  }
  return ROUTES[0].path;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}

function summarize(nivel: number, inicio: Date, fin: Date, samples: Sample[], abortado: boolean, motivo?: string): LevelResult {
  const lat = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statuses: Record<string, number> = {};
  const porRuta: Record<string, number> = {};
  let ok = 0;
  let timeouts = 0;
  for (const s of samples) {
    statuses[String(s.status)] = (statuses[String(s.status)] ?? 0) + 1;
    porRuta[s.path] = (porRuta[s.path] ?? 0) + 1;
    if (s.status >= 200 && s.status < 400) ok += 1;
    if (s.timeout) timeouts += 1;
  }
  return {
    nivel,
    inicioIso: inicio.toISOString(),
    finIso: fin.toISOString(),
    duracionS: Math.round(((fin.getTime() - inicio.getTime()) / 1000) * 10) / 10,
    total: samples.length,
    ok,
    errores: samples.length - ok,
    timeouts,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    p99: percentile(lat, 99),
    avg: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
    max: lat.length ? Math.round(lat[lat.length - 1]) : 0,
    statuses,
    porRuta,
    abortado,
    motivo,
  };
}

async function runLevel(nivel: number, cookie: string): Promise<LevelResult> {
  const samples: Sample[] = [];
  const inicio = new Date();
  const finTs = inicio.getTime() + LEVEL_SECONDS * 1000;
  let stop = false;

  const worker = async () => {
    while (!stop && Date.now() < finTs) {
      const path = pickPath();
      const t0 = performance.now();
      let status = 0;
      let timeout = false;
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: { Cookie: cookie },
          redirect: "manual",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        status = res.status;
        await res.arrayBuffer(); // consumir el body para medir respuesta completa
      } catch (e) {
        timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        status = timeout ? 0 : -1;
      }
      samples.push({ ms: performance.now() - t0, status, path, timeout });

      // Parada temprana: suficientes muestras y tasa de error/timeout alta.
      if (samples.length >= 30 && samples.length % 10 === 0) {
        const errs = samples.filter((s) => s.status < 200 || s.status >= 400).length;
        const tos = samples.filter((s) => s.timeout).length;
        if (errs / samples.length > ERROR_RATE_ABORT || tos / samples.length > TIMEOUT_RATE_ABORT) {
          stop = true;
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    }
  };

  await Promise.all(Array.from({ length: nivel }, () => worker()));
  const fin = new Date();
  const abortado = stop;
  const motivo = abortado ? "error/timeout rate superó el umbral" : undefined;
  return summarize(nivel, inicio, fin, samples, abortado, motivo);
}

async function main() {
  console.log(`Carga progresiva → ${BASE_URL}`);
  console.log(`Escalones: ${LEVELS.join(", ")} usuarios · ${LEVEL_SECONDS}s por escalón\n`);

  const { name, value } = await sessionCookie(E2E_EMAIL);
  const cookie = `${name}=${value}`;

  // Warmup: una petición para despertar al isolate antes de medir.
  await fetch(`${BASE_URL}/admin`, { headers: { Cookie: cookie }, redirect: "manual" });

  const results: LevelResult[] = [];
  for (const nivel of LEVELS) {
    const r = await runLevel(nivel, cookie);
    results.push(r);
    console.log(
      `n=${String(nivel).padStart(2)} · ${r.total} req · ok=${r.ok} err=${r.errores} to=${r.timeouts} · ` +
        `p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms · ${r.inicioIso}→${r.finIso}` +
        (r.abortado ? ` · ABORTADO (${r.motivo})` : ""),
    );
    if (r.abortado) {
      console.log("Umbral de seguridad superado — se detiene el run.");
      break;
    }
    // Pausa entre escalones para observar ventanas separadas en Observability.
    await new Promise((res) => setTimeout(res, 5000));
  }

  await mkdir(".smoke-shots", { recursive: true });
  const out = ".smoke-shots/load-report.json";
  await writeFile(out, JSON.stringify({ baseUrl: BASE_URL, generadoEn: new Date().toISOString(), niveles: LEVELS, segundosPorNivel: LEVEL_SECONDS, resultados: results }, null, 2));
  console.log(`\nReporte: ${out}`);

  const algunoAborto = results.some((r) => r.abortado);
  process.exit(algunoAborto ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
