# 52 — Características activables del POS: modelo y persistencia

**Prioridad:** P1 · **Depende de:** — · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
Que la dueña pueda elegir qué módulos del punto de venta aparecen o no (agenda y citas, cobro y caja, ventas y tienda, clientes y marketing, página y presencia, caja, impresión, gastos), como muestran las capturas de referencia de Northud. La selección se guarda por organización y persiste entre sesiones.

**Fuera de alcance\***
Rediseño del ticket de cobro (misión 54), pantallas de selección al iniciar (misión 53), migraciones destructivas, deploy.

## Contexto verificado\*

- `src/modules/onboarding/types.ts:149-216` — `PackArranquePreset` y `PACKS_ARRANQUE_MEXICO` (estética, barbería, unas, pestañas): modelo existente de presets de negocio que sirve de referencia para el catálogo de características.
- `src/db/schema/onboarding.ts:22-50` — tabla `progreso_guias`: patrón de tabla por organización/usuario con índice único y checks.
- `src/app/admin/pos/page.tsx:35-161` — POS actual ("Cobrar", venta rápida, ventas de hoy): lo que se va a simplificar y condicionar a las características activas.
- `src/modules/pos/service.ts` — operaciones de venta (cobro, anticipos, paquetes, membresías, promociones, devoluciones): complejidad actual del cobro que debe poder ocultarse.

## Diseño decidido (si aplica)

- Nueva tabla `configuracion_pos` con columnas: `id` (uuid PK), `organizacion_id` (uuid FK → organizaciones), `clave` (varchar), `valor` (boolean, default true), `actualizada_at`. Índice único `(organizacion_id, clave)`.
- Claves de característica: `agenda-citas`, `cobro-caja`, `ventas-tienda`, `clientes-marketing`, `pagina-presencia`, `caja`, `impresion`, `gastos`.
- Por defecto todas activas `true` para organizaciones existentes; la dueña puede desactivar las que no use.
- Migración SQL escrita a mano en `drizzle/0057_*.sql` (estilo de las existentes) + registro en `src/db/schema/core.ts` para que `drizzle-kit check` quede sincronizado.

## Pasos

1. `drizzle/0057_configuracion_pos.sql` — crear tabla `configuracion_pos` con FK, índice único y valores default `true`.
2. `src/db/schema/core.ts` — registrar la tabla `configuracion_pos` en el esquema de Drizzle (para `db:check`).
3. `src/modules/pos/caracteristicas.ts` — definir `CARACTERISTICAS_POS` (id, etiqueta, descripción, permiso, ruta, activaPorDefecto) y tipo `ConfiguracionPos`.
4. `src/modules/pos/queries.ts` — `cargarConfiguracionPos(organizacionId)` y `guardarConfiguracionPos(organizacionId, clave, valor)` en 1 consulta cada una (subselect o upsert).
5. Prueba nueva `src/modules/pos/caracteristicas.test.ts` — cubre defaults, activar/desactivar y lectura por organización.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → pruebas existentes + las nuevas de características en verde.
- [ ] `pnpm db:check` → 100 % sincronizado (schema.ts ↔ DB).
- [ ] Recorrido manual: insertar una organización, leer su configuración (todas true), desactivar `caja`, leer de nuevo (caja false, resto true).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm db:check        (toca src/db/schema)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una migración destructiva o un secreto.
- El cambio excede los archivos previstos o toca otro módulo.

## Reporte (al terminar)

```
Misión: 52 — Características activables del POS: modelo y persistencia
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | db:check ✔
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
