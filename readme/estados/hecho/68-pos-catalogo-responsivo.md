# 68 — POS: CatalogoSelector responsivo

**Prioridad:** P2 · **Depende de:** 66 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 1

**Objetivo**
Mejor aprovechamiento del espacio en tablets en el catálogo: grid de productos 3-4 columnas, input de búsqueda más ancho, tabs más espaciados.

**Fuera de alcance**
No se cambia la lógica del catálogo ni las acciones. No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/catalogo-selector.tsx` — grid: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`. En tablets (md-lg) solo 3 columnas.
- `src/app/admin/pos/catalogo-selector.tsx` — input: `sm:max-w-64` (256px). En tablets es estrecho.
- `src/app/admin/pos/catalogo-selector.tsx` — tabs: `sm:px-4`. En tablets podría ser más espaciado.

## Diseño decidido

- Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
- Input: `md:max-w-72` (288px).
- Tabs: `md:px-5`.

## Pasos

1. `catalogo-selector.tsx` — grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
2. `catalogo-selector.tsx` — input: `md:max-w-72`.
3. `catalogo-selector.tsx` — tabs: `md:px-5`.
4. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En tablets (md) el grid muestra 3 columnas; en lg 4 columnas.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1 h de agente |
| Archivos tocados | ≤ 1 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos`.

## Reporte (al terminar)

```
Misión: 68 — CatalogoSelector responsivo
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔
Antes → después: <grid 2-3 cols en tablets → 3-4 cols en tablets+>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
