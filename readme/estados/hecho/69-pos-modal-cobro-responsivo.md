# 69 — POS: modal de cobro responsivo

**Prioridad:** P2 · **Depende de:** 66 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 2

**Objetivo**
El modal de cobro se adapta a tablets: más ancho, mejor espaciado, sin cortar contenido.

**Fuera de alcance**
No se cambia la lógica del cobro ni `ModalConfirmacionCobro`. No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:997` — Dialog: `max-w-md` (448px). En tablets es estrecho.
- `src/app/admin/pos/cobro-form.tsx:261` — CobroForm: `p-5 shadow-sm sm:p-6`. En tablets sigue `p-5` porque `sm` es 640px (pero tablets son 768px+, así que ya tiene `p-6`).

## Diseño decidido

- Dialog: `max-w-md md:max-w-lg` (448px en móvil, 512px en tablets+).
- CobroForm: `p-5 md:p-7` (más padding en tablets).

## Pasos

1. `venta-ticket.tsx` — Dialog: `max-w-md md:max-w-lg`.
2. `cobro-form.tsx` — CobroForm: `p-5 md:p-7`.
3. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En tablets el modal de cobro es más ancho (512px) y con más padding.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
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
Misión: 69 — modal de cobro responsivo
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔
Antes → después: <modal estrecho en tablets → modal más ancho y con más padding>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
