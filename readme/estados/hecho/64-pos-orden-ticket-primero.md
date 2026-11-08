# 64 — POS: orden ticket primero, sin acciones de imprimir durante el cobro, Cobrar solo con líneas

**Prioridad:** P1 · **Depende de:** 58, 59, 62, 63 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 1

**Objetivo**
En móvil, la pantalla de venta muestra primero el ticket (productos/servicios), luego el resumen de cobro. Las acciones de imprimir/WhatsApp/compartir imagen se quitan del flujo de cobro (ya viven en el modal post-cobro `ModalConfirmacionCobro`). El botón "Cobrar" solo aparece si hay líneas en el ticket.

**Fuera de alcance**
No se toca el modal de cobro ni `ModalConfirmacionCobro`. No se añaden dependencias. En desktop se conserva el layout de dos columnas.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:632` — grid principal: `grid-cols-1 gap-6 xl:grid-cols-[...]` con `section` (ticket/izquierda) y `aside` (resumen/derecha). En móvil el aside iba primero por `order-1`.
- `src/app/admin/pos/venta-ticket.tsx:981-1035` — bloque `editable` renderizaba `TicketActionsBar` (imprimir preliminar, WhatsApp, compartir imagen) + botón "Cobrar" siempre visible, incluso sin líneas.
- `src/app/admin/pos/cobro-form.tsx` — ya acepta `enDialog`/`onClose` (misión 62).

## Diseño decidido

- En móvil: `section` (ticket) `order-1`, `aside` (resumen) `order-2`. En desktop se conserva (`md:order-2` / `md:order-1`).
- Se quita `<TicketActionsBar>` del bloque `editable`. Las acciones de imprimir/WhatsApp/compartir imagen solo se muestran en el modal post-cobro (`ModalConfirmacionCobro`), que ya existe.
- Nuevo estado derivado `tieneLineas` (servicios/productos/paquetes/membresías). El botón "Cobrar" solo se renderiza si `editable && tieneLineas`.

## Pasos

1. `venta-ticket.tsx` — cambiar `order` del section y aside; quitar `TicketActionsBar` del bloque editable; añadir `tieneLineas` y condicionar el botón Cobrar.
2. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En móvil, el ticket (productos/servicios) aparece antes que el resumen de cobro.
- [ ] En móvil, no se ven botones "Imprimir preliminar" / "Enviar por WhatsApp" / "Compartir imagen" durante el cobro.
- [ ] El botón "Cobrar" solo aparece si hay al menos una línea en el ticket.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1 h de agente |
| Archivos tocados | ≤ 1 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos` venta individual (los 2 errores del índice del POS son preexistentes y ajenos).
- El botón Cobrar aparece sin líneas.

## Reporte (al terminar)

```
Misión: 64 — orden ticket primero, sin imprimir durante cobro, Cobrar condicional
Cambios: venta-ticket.tsx: section order-1 md:order-2 (ticket primero en móvil); aside order-2 md:order-1; quita TicketActionsBar del bloque editable (acciones solo en modal post-cobro); añade tieneLineas y condiciona botón Cobrar a editable && tieneLineas.
Verificación: typecheck ✔ | lint ✔ | test 626 ✔ | build ✔ | usability: venta individual OK; 2 errores preexistentes en índice del POS (Nueva venta rápida / Ver historial cortados, ajenos a esta misión)
Antes → después: resumen arriba + ticket abajo + acciones de imprimir en pantalla + Cobrar siempre visible → ticket primero + resumen abajo + sin acciones de imprimir durante cobro + Cobrar solo con líneas
Desviaciones: ninguna
Riesgo abierto: 2 errores de layout-movil en índice del POS son preexistentes (causados por cambios no commiteados ajenos a esta misión)
```
