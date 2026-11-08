# 67 — POS: touch targets y numpad en tablets

**Prioridad:** P1 · **Depende de:** 66 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 2

**Objetivo**
En tablets táctiles, el numpad es visible y los controles de cantidad tienen tamaño adecuado (≥32px) para interacción táctil cómoda.

**Fuera de alcance**
No se cambia el modal de cobro ni `ModalConfirmacionCobro`. No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/cobro-form.tsx:499` — numpad: `sm:hidden` (visible solo hasta 640px). En tablets (768-1280px) no hay numpad ni teclado físico.
- `src/app/admin/pos/venta-ticket.tsx` (TicketLine) — botones de cantidad: `size-8` (32px). Cumple ≥24px pero es ajustado.
- `src/app/admin/pos/venta-ticket.tsx` (TicketLine) — botón quitar: `size-9` (36px). Cumple ≥24px pero es ajustado.

## Diseño decidido

- Numpad: `sm:hidden` → `md:hidden` (visible en tablets táctiles).
- Botones de cantidad: `size-8` → `size-9` en móvil, `size-10` en sm+.
- Botón quitar: `size-9` → `size-10`.

## Pasos

1. `cobro-form.tsx` — numpad: `sm:hidden` → `md:hidden`.
2. `venta-ticket.tsx` (TicketLine) — botones de cantidad: `size-8` → `size-9` en móvil, `size-10` en sm+.
3. `venta-ticket.tsx` (TicketLine) — botón quitar: `size-9` → `size-10`.
4. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En tablets (768-1280px) el numpad es visible.
- [ ] Los controles de cantidad tienen ≥32px en móvil y ≥40px en sm+.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1 h de agente |
| Archivos tocados | ≤ 2 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos`.

## Reporte (al terminar)

```
Misión: 67 — touch targets y numpad en tablets
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔ | usability 0 errores
Antes → después: <numpad solo móvil, controles 32px → numpad en tablets, controles 32-40px>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
