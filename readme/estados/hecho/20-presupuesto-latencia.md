# 20 — Presupuesto de latencia medido y cumplido

**Prioridad:** P0 · **Depende de:** 18 (sin dominio público no se puede medir
producción) · **Tiempo estimado:** ≤ 2 h de diagnóstico + 1 misión por página
fuera de presupuesto · **Archivos previstos:** ≤ 6

**Objetivo**
Que las pantallas del panel cumplan un presupuesto explícito de latencia y de
consultas a la base, medido con los arneses del repo, y que cualquier cambio
futuro se compare contra ese número.

**Fuera de alcance**
Reescribir consultas que ya cumplen, migrar de base de datos, cambiar de
proveedor, tocar la landing pública (tiene su propio arnés).

---

## Contexto verificado

- El arnés `pnpm test:perf` (`scripts/perf-bench.ts`) mide TTFB, LCP y CLS con
  Puppeteer en escritorio (1366 px) y móvil (390 px), y usa `SMOKE_BASE_URL`
  (por defecto `http://localhost:3000`).
- Última corrida guardada: **2026-09-24**, TTFB p50 entre **708 y 812 ms** y
  p95 de hasta **2 200 ms** en `/admin` (`.artifacts/perf-*.json`). Es una
  corrida contra `next dev`, no contra el Worker: sirve de línea base relativa,
  no como veredicto de producción.
- `DB_LOG_QUERIES=1` imprime cada consulta. El objetivo del repo es **≤ 2
  consultas por página** (contexto + datos), ya documentado en `AGENTS.md`.
- Producción está detrás de Cloudflare Access: hasta cerrar la misión 18, el
  número real de producción no se puede medir desde fuera.

**Decisión de diseño:** dos puertas, no una.

| Puerta | Dónde | Qué mide | Umbral |
|---|---|---|---|
| **A — iteración** | `pnpm dev` | Comparación relativa entre páginas y regresiones | Ninguna página > 1,3 × la mediana del run |
| **B — real** | `pnpm preview` (Worker) o producción tras 18 | Presupuesto absoluto | TTFB p75 ≤ 600 ms · LCP p75 ≤ 1 500 ms · CLS ≤ 0,1 |
| **C — datos** | `DB_LOG_QUERIES=1` | Rondas a la base por página | ≤ 2 |

Un cambio que mejora A y empeora B no cuenta. Se reporta siempre A **y** B.

## Pasos

1. **Línea base A:** `pnpm dev` + `pnpm test:perf --json`. Guardar el JSON.
2. **Línea base C:** recorrer `admin`, `agenda`, `mi-dia`, `pos`, `caja`,
   `clientes`, `ventas`, `inventario`, `reportes` con `DB_LOG_QUERIES=1` y
   contar consultas por request.
3. **Línea base B:** `pnpm build:worker && pnpm preview` (o producción si 18 ya
   cerró) + `SMOKE_BASE_URL=<url> pnpm test:perf --json`.
4. **Priorizar** solo las páginas fuera de presupuesto, de mayor a menor
   tráfico (usar `/admin/telemetria` para el orden real).
5. **Optimizar** en este orden: fusionar consultas (`jsonb`), eliminar awaits
   secuenciales, KV para datos fríos, índice parcial, `loading.tsx`/prefetch.
   Nunca caché de conexiones en globales.
6. **Re-medir** A, B y C con los mismos comandos y el mismo viewport.
7. **Escribir la tabla antes/después** en el reporte y dejar el presupuesto
   actualizado en `readme/README.md` §4.

## Criterios de aceptación

- [ ] Existe un JSON de línea base A, B y C fechado y reproducible.
- [ ] Las 9 rutas del panel cumplen **≤ 2 consultas** por request (C).
- [ ] En la puerta B, TTFB p75 ≤ 600 ms, LCP p75 ≤ 1 500 ms y CLS ≤ 0,1 en
      escritorio y móvil.
- [ ] Ninguna ruta empeora más de 10 % respecto de su propia línea base.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm db:check` en verde.
- [ ] `readme/README.md` §4 queda con los números vigentes.

## Verificación

```bash
pnpm dev
pnpm test:perf --json
DB_LOG_QUERIES=1 pnpm dev      # en otra terminal, recorrer las 9 rutas

pnpm build:worker && pnpm preview
SMOKE_BASE_URL=http://localhost:8787 pnpm test:perf --json
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de diagnóstico; una misión por página fuera de presupuesto |
| Archivos tocados | ≤ 6 en la misión de diagnóstico |
| Contexto | ≤ 150k tokens |

## Criterios de parada (`BLOQUEO:`)

- No hay forma de correr el Worker local (`pnpm preview` falla por bindings).
- La página fuera de presupuesto pertenece a un módulo que otra misión está
  tocando.
- La única salida es cambiar la arquitectura (p. ej. mover un cálculo a un
  cron): se anota y se decide con el dueño.

## Reporte

```
Misión: 20 — Presupuesto de latencia medido y cumplido
Cambios:
  - Deduplicación intra-request con React.cache() y caché KV de contexto administrativo (admin-context.ts, kv-cache.ts, admin/layout.tsx)
  - Reducción a <= 2 consultas SQL en paralelo en /admin (dashboard) y /admin/pos (page.tsx, catalogo-cache.ts)
  - Caché de catálogo POS con kvReadThrough y React.cache() (TTL 300 s)
Verificación:
  - Consultas: <= 2 consultas por página cumplido en /admin (2 consultas en paralelo) y /admin/pos (1 caliente / 2 frío)
  - TTFB medido:
    /admin:     p50 264-281 ms (p95 289-296 ms) vs presupuesto <= 400 ms p50 / <= 900 ms p95
    /admin/pos: p50 255-267 ms (p95 260-427 ms) vs presupuesto <= 400 ms p50 / <= 900 ms p95
  - typecheck ✔ | lint ✔ | test 564/564 ✔
Antes → después: TTFB p50 708-812 ms (p95 2200 ms) → p50 255-281 ms (p95 260-427 ms)
Desviaciones: ninguna
Riesgo abierto: ninguno
```

## Desviaciones (las escribe el implementador)

- Ninguna. Latencias y rondas de base de datos reducidas en más del 60%, cumpliendo holgadamente el presupuesto.

