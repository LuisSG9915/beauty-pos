# 66 — POS: grid responsivo (2 columnas desde md)

**Prioridad:** P1 · **Depende de:** 64 ·
**Tiempo estimado:** ≤ 1.5 h · **Archivos previstos:** ≤ 2

**Objetivo**
En tablets (768px+) el POS muestra 2 columnas (ticket + resumen) en lugar de 1, aprovechando el espacio horizontal. El scroll interno solo se activa en móvil, no en tablets.

**Fuera de alcance**
No se cambia el modal de cobro ni `ModalConfirmacionCobro`. No se añaden dependencias. En desktop se conserva el layout actual.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:635` — grid principal: `grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]`. En tablets (768-1280px) es una sola columna.
- `src/app/admin/pos/venta-ticket.tsx:636` — section: `sm:max-h-[45vh] sm:overflow-y-auto`. Scroll desde 640px, incluye tablets.
- `src/app/admin/pos/venta-ticket.tsx:830` — aside: `sm:max-h-[60vh] sm:overflow-y-auto xl:max-h-none xl:overflow-visible`. Scroll desde 640px, se quita solo en xl (1280px+).
- `src/app/admin/pos/venta-ticket.tsx:635` — gap: `gap-6` en todos los tamaños.
- `src/app/admin/pos/venta-ticket.tsx:636, 829` — padding: `p-4 sm:p-6` (en tablets sigue `p-4` porque `sm` es 640px).

## Diseño decidido

- Grid: `md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]` en lugar de `xl:grid-cols-[...]`. En móvil (640px-) sigue siendo 1 columna.
- Scroll: `sm:max-h-[45vh]` → `md:max-h-[45vh]` (scroll solo en móvil). `sm:max-h-[60vh]` → `md:max-h-[60vh]`.
- Scroll off: `xl:max-h-none xl:overflow-visible` → `md:max-h-none md:overflow-visible` (quitar scroll en tablets+).
- Padding: `p-4 sm:p-6` → `p-4 md:p-6` en secciones.
- Gap: `gap-6` → `gap-4 md:gap-6`.

## Pasos

1. `venta-ticket.tsx` — grid: `md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]` en lugar de `xl:grid-cols-[...]`.
2. `venta-ticket.tsx` — section: `md:max-h-[45vh] md:overflow-y-auto` en lugar de `sm:...`.
3. `venta-ticket.tsx` — aside: `md:max-h-[60vh] md:overflow-y-auto md:max-h-none md:overflow-visible` (quitar scroll en tablets+).
4. `venta-ticket.tsx` — padding: `p-4 md:p-6` en section y aside.
5. `venta-ticket.tsx` — gap: `gap-4 md:gap-6`.
6. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En tablets (768px+) se muestran 2 columnas (ticket + resumen).
- [ ] En móvil (640px-) se mantiene 1 columna con scroll.
- [ ] En desktop (1280px+) no hay scroll interno.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1.5 h de agente |
| Archivos tocados | ≤ 2 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos`.
- El grid de 2 columnas rompe el layout en móvil.

## Reporte (al terminar)

```
Misión: 66 — grid responsivo 2 columnas desde md
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔ | usability 0 errores
Antes → después: <1 columna en tablets → 2 columnas en tablets+>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
