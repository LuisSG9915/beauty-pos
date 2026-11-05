# 31 — El panel de plataforma muestra cuánto tarda un salón nuevo en hacer su primer cobro

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 5

**Objetivo\***
En `/admin` (plataforma), junto al embudo del piloto, se ve en una o dos
cifras cuánto tardan las organizaciones nuevas en hacer su primer cobro
(percentiles en minutos desde el registro) y qué porcentaje lo logra en
≤ 10 minutos — la meta S6 del plan maestro, hoy sin ninguna medición.

**Fuera de alcance\***
Tocar el embudo existente, `/admin/telemetria`, el onboarding de la
organización, migraciones de esquema o eventos nuevos de telemetría: los
datos ya existen en `organizaciones` y `ventas`.

---

## Contexto verificado

- `src/app/admin/page.tsx:334-399` — El panel de plataforma resuelve todo en
  un `Promise.all` de 9 consultas. `orgsConVenta` (líneas 376-381) ya
  selecciona `ventas.organizacionId` filtrando `estado='completada'` y
  `activo=true`, agrupado por organización.
- `src/app/admin/page.tsx:336-338` — el SELECT de `organizaciones` trae
  `id, nombre, slug, activo` pero **no** `createdAt`; la columna existe
  (la misma consulta ordena por `desc(organizaciones.createdAt)`).
- `src/app/admin/page.tsx:424` — `activadas` cuenta organizaciones con ≥1
  venta completada; la tarjeta "Embudo del piloto" (líneas 453-485) solo
  muestra conteos y porcentajes, sin dimensión de tiempo.
- `ventas.createdAt` existe en el esquema (toda venta tiene timestamp de
  creación); para el POS la venta se crea al cobrar, así que el `min` de
  la primera venta completada ≈ momento del primer cobro.
- No existe métrica de tiempo-a-primer-cobro en ninguna parte: ni en
  `/admin/telemetria` (solo uso de producto y web vitals) ni en el embudo.

## Diseño decidido

- **Cero rondas extra a la BD**: ampliar la consulta `orgsConVenta` para
  devolver por organización `{ organizacionId, primeraVentaAt }` con
  `min(ventas.createdAt)` bajo el mismo filtro, y añadir
  `createdAt: organizaciones.createdAt` al SELECT de organizaciones. El
  cálculo ocurre en memoria al renderizar.
- **Cálculo puro** (función local del archivo o helper en
  `src/modules/billing/`): por cada organización, si tiene
  `primeraVentaAt`, `minutos = max(0, (primeraVentaAt - orgCreatedAt)/60000)`
  (clamp a 0 por clock skew). Reportar `p50`, `p95`, `% ≤ 10 min` y
  `sinPrimerCobro` (organizaciones activas sin venta completada).
- **UI**: tarjeta hermana de "Embudo del piloto" titulada "Tiempo a la
  primera venta", con 3-4 cifras en lenguaje llano: "Primera venta
  típica", "9 de cada 10 lo logran en", "% en 10 min o menos". Sin ventas
  → EmptyState "Aún no hay ventas cobradas".

## Pasos

1. `src/app/admin/page.tsx` — ampliar `orgsConVenta` con `min(createdAt)`
   y añadir `createdAt` al SELECT de `organizaciones`.
2. `src/app/admin/page.tsx` — cálculo de percentiles + tarjeta nueva
   dentro del mismo `Promise.all`/render (sin consultas nuevas).
3. Prueba unitaria del cálculo puro si se extrae a módulo (p. ej.
   `src/modules/billing/activacion.test.ts`): percentiles correctos, org
   sin venta excluida del denominador, skew de reloj → 0.

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `/admin` con sesión de plataforma muestra la tarjeta con números
      coherentes con las ventas reales (verificable con una consulta SQL
      de contraste).
- [ ] Una organización sin ventas no rompe la tarjeta ni cuenta como
      "≤ 10 min".

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev   # recorrido manual: /admin con sesión de plataforma
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 5 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- `ventas.createdAt` no existe o no marca el momento del cobro (p. ej. la
  venta se crea días antes de cobrarse): se anota y se decide la columna
  correcta con el dueño.
- La consulta `orgsConVenta` no se puede ampliar sin romper el
  `Promise.all` existente.

## Reporte (al terminar)

```
Misión: 31 — Tiempo a la primera venta en el panel de plataforma
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔
Antes → después: embudo solo contaba activaciones → p50/p95/%≤10min visibles
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
