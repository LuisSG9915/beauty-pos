# 77a — Folio consecutivo por sucursal: datos y asignación

**Prioridad:** P1 · **Depende de:** 76 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo**
Cada venta cobrada recibe un folio consecutivo por sucursal (1, 2, 3…),
asignado dentro de la misma transacción del cobro, sin duplicados ni huecos por
reintentos. Las ventas en proceso no tienen folio; las canceladas conservan el
suyo.

**Fuera de alcance**
No se muestra el folio en la UI todavía (eso es la 77b). No se cambia la lógica
de cobro, pagos ni idempotencia. No se aplican migraciones a ninguna base sin
autorización expresa del dueño (`pnpm db:migrate` puede apuntar a producción).

## Contexto verificado

- `src/db/schema/operations.ts:173-216` — tabla `ventas`: NO tiene columna
  `folio`. Estados `en_proceso`/`completada`/`cancelada`, `cobrada_at`,
  índices existentes (`ventas_sucursal_cobrada_idx`, etc.).
- `src/db/schema/operations.ts:22-27` — `opAuditColumns`
  (`created_at/by`, `updated_at/by`).
- `src/modules/pos/service.ts:97-585` — `ejecutarVentaTransaccional`:
  - `:103-122` idempotencia por `idempotencyKey` → devuelve
    `folio: existente.id.slice(0,8)` (fragmento de UUID).
  - `:126-163` rama `ventaId` existente: `select … for update`, si ya está
    `completada` devuelve `yaProcesada` (`:143-149`); si no, `update` a
    `completada` + `cobrada_at` (`:151-163`) — **aquí se asigna el folio**.
  - `:164-194` rama sin `ventaId` (venta directa/offline): `insert` ya en
    `completada` — **aquí también se asigna el folio**.
  - `:572-576` retorno `folio: finalVentaId.slice(0,8)`.
  - `:579-584` `withRetry(db.transaction(ejecutarTx))` — los conflictos de
    concurrencia se reintentan aquí.
- `src/modules/pos/service.ts:588` — `ejecutarInsercionVentaLote` es alias de
  la misma función; la usa `offline-actions.ts:211` para ventas sin conexión
  (siempre entran por la rama insert).
- `src/app/admin/pos/actions.ts:818-855` — `cobrarVenta` llama
  `ejecutarVentaTransaccional` con `ventaId` (rama update) dentro de
  `withDbRetry` + transacción.
- `drizzle/` — migraciones numeradas (`0057_…` la última); `pnpm db:generate`
  regenera, `pnpm db:check` verifica sincronía, `pnpm db:migrate` aplica.
- Nadie consume `resultadoVenta.folio` para mostrarlo hoy (verificado: solo se
  usa `ventaId`); el folio visible `OFF-…` de ventas offline lo genera el
  cliente en `src/app/offline/venta/offline-venta.tsx:204`.

## Diseño decidido

- **Esquema** (migración generada con `pnpm db:generate`, con backfill):
  - `ventas.folio integer` NULL mientras `estado = 'en_proceso'`.
  - `uniqueIndex("ventas_sucursal_folio_uq").on(sucursalId, folio)` — los NULL
    no colisionan.
  - Tabla `folios_venta`: `sucursal_id uuid PK → sucursales.id`,
    `ultimo integer not null`, `updated_at`. Una fila por sucursal.
- **Asignación** dentro de `ejecutarTx`, en las DOS ramas que confirman cobro:
  ```sql
  insert into folios_venta (sucursal_id, ultimo)
  values ($sucursalId, 1)
  on conflict (sucursal_id)
  do update set ultimo = folios_venta.ultimo + 1
  returning ultimo
  ```
  - Rama update (`ventaId` existente): asignar solo si `folio IS NULL` (una
    venta en proceso no tiene; una cancelada-devuelta no vuelve a cobrar).
  - Rama insert (sin `ventaId`): asignar en el mismo `insert` o justo después.
  - Los retornos idempotentes (`yaProcesada`) **no consumen folio**: devuelven
    el `folio` ya guardado (agregar `folio` al `select` de existencia).
  - `ResultadoVentaTransaccional.folio` pasa a ser el número real como string
    (p. ej. `"42"`); el formato "0042" es decisión de la 77b.
- **Backfill** en la misma migración: por cada sucursal, numerar las ventas
  `completada`/`cancelada` en orden `coalesce(cobrada_at, created_at), id`
  desde 1, escribir `ventas.folio` y dejar `folios_venta.ultimo` en el mayor.
  Ventas `en_proceso` quedan con `folio NULL`.
- **Concurrencia**: el `on conflict … do update` serializa por sucursal dentro
  de la transacción; si Cockroach aborta por conflicto, `withRetry` reintenta
  la transacción completa (la idempotencia interna lo hace seguro).

## Pasos

1. `src/db/schema/operations.ts` — `folio` en `ventas`, índice único, tabla
   `folios_venta`.
2. `pnpm db:generate` — migración con DDL + backfill (escribir el backfill a
   mano en el SQL generado si drizzle no lo emite).
3. `src/modules/pos/service.ts` — asignación en ambas ramas + `folio` real en
   los retornos idempotentes.
4. Pruebas del servicio (patrón existente en `src/modules/pos/*.test.ts` o el
   harness de integración que ya exista): cobro asigna N+1 por sucursal,
   reintento idempotente conserva el folio, sucursales numeran por separado,
   venta cancelada conserva su número.
5. `pnpm db:check` → 100 %.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde con las pruebas nuevas del folio.
- [ ] `pnpm db:check` → esquema y migraciones sincronizados.
- [ ] `pnpm db:migrate` → **solo con autorización expresa del dueño** (puede
      ser producción); si no se autoriza, queda como paso pendiente documentado.
- [ ] Prueba de concurrencia lógica: dos cobros seguidos en la misma sucursal
      reciben folios consecutivos sin duplicar.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm db:check
# pnpm db:generate ya corrió para crear la migración
# pnpm db:migrate  ← SOLO con autorización del dueño
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `pnpm db:generate` no produce la migración o el backfill requiere SQL que
  drizzle no soporta → escribir el SQL a mano en el archivo de migración y
  documentarlo.
- El backfill toca un volumen de ventas que hace inviable una sola pasada →
  partir por lotes y documentar.
- `db:check` reporta desincronía que no se resuelve con la migración generada.
- Se necesita aplicar la migración a producción sin autorización → `BLOQUEO:`.

## Reporte (al terminar)

```
Misión: 77a — folio consecutivo por sucursal (datos)
Cambios:
- src/db/schema/operations.ts — ventas.folio integer NULL, índice único
  ventas_sucursal_folio_uq(sucursal_id, folio) (NULL no colisiona) y tabla
  folios_venta(sucursal_id PK → sucursales, ultimo, updated_at).
- drizzle/0057_abnormal_shard.sql — DDL generado + backfill a mano:
  row_number() por sucursal sobre ventas completada/cancelada en orden
  coalesce(cobrada_at, created_at), id; folios_venta.ultimo = max(folio).
  La misma migración crea configuracion_pos (ver desviaciones).
- src/modules/pos/service.ts — asignarFolioVenta(): INSERT … ON CONFLICT
  (sucursal_id) DO UPDATE ultimo+1 RETURNING dentro de ejecutarTx, en las
  dos ramas que confirman cobro (update con ventaId usa el sucursalId de la
  venta bloqueada; insert usa input.sucursalId). Retornos idempotentes
  devuelven el folio guardado (fallback al slice del UUID si es NULL).
  ResultadoVentaTransaccional.folio ahora es el número real ("42").
- src/modules/pos/service.test.ts — 5 pruebas nuevas del folio.
Verificación: typecheck ✔ | lint ✔ | test 646 ✔ | db:check ✔ |
  db:migrate APLICADA (autorización expresa del dueño) | backfill
  verificado en BD: 369 completadas folio 1..N por sucursal, 154 en_proceso
  NULL, contadores folios_venta = max(folio), 0 duplicados | smoke ✔ |
  flows 77/77 ✔ (los cobros E2E siguieron la secuencia: folios 154-165 en
  la sucursal E2E, contador en 165)
Antes → después: folio = fragmento del UUID → consecutivo por sucursal
  asignado atómicamente en la transacción del cobro.
Desviaciones:
- La migración incluye CREATE TABLE configuracion_pos: la tabla está en el
  esquema y el código la consulta (pos/queries.ts) pero nunca existió en la
  base — su archivo 0057_configuracion_pos.sql quedó huérfano (fuera del
  journal de drizzle). db:generate la detectó como pendiente y la incluye;
  aplicar la migración repara ese hueco. El archivo huérfano se conserva.
- Dos archivos quedaron numerados 0057 (el huérfano y el generado); drizzle
  solo corre los del journal, no hay conflicto.
- asignarFolioVenta usa el query builder de drizzle (onConflictDoUpdate)
  en vez del SQL crudo del diseño: mismo INSERT…ON CONFLICT…RETURNING y
  permite afirmar el sucursalId en las pruebas con mocks.
Riesgo abierto: ninguno funcional; 77b decide el formato visible ("0042").
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
