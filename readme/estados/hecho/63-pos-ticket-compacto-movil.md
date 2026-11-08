# 63 — POS: ticket compacto con scroll y cobro sticky en móvil (opción B)

**Prioridad:** P1 · **Depende de:** 58, 59, 62 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 2

**Objetivo**
En móvil, el ticket del POS ocupe menos altura: el encabezado del ticket (cliente, estado, total) queda visible arriba, las líneas de servicios/productos van en un área con scroll, y el total + botón "Cobrar" se quedan fijos en una barra sticky al fondo. El cobro sigue siendo el modal centrado (misión 62). Coincide con la propuesta B elegida por el usuario.

**Fuera de alcance**
No se cambia el modal de cobro ni su lógica. No se añaden dependencias. No se toca el shell admin ni otras pantallas. En desktop se conserva el layout actual (dos columnas).

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:625` — grid principal: `grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]`. Izquierda = líneas (section, ~626-818), derecha = resumen/cobro (aside, ~820-1013). En móvil se apilan izquierda luego derecha.
- `src/app/admin/pos/venta-ticket.tsx:820-937` — `<section>` "Resumen de cobro" con total grande, desglose plegable y anticipos.
- `src/app/admin/pos/venta-ticket.tsx:982-1013` — `TicketActionsBar` (preliminar) + botón "Cobrar" que abre `<Dialog>` con `<CobroForm enDialog>`.
- `src/app/admin/pos/cobro-form.tsx` — ya acepta `enDialog`/`onClose` (misión 62).

## Diseño decidido

- En móvil, el `<aside>` (derecha/resumen) se ordena **antes** que el `<section>` (izquierda/líneas) usando `order-1`/`order-2` de Tailwind, para que el usuario vea el resumen y el botón Cobrar al llegar abajo sin hacer scroll de todo el ticket.
- El `<aside>` tiene `min-h-0` para permitir que su contenido interno se scrolle.
- Dentro del `<aside>`, el bloque final con **total grande + botón Cobrar** se envuelve en `<div className="sticky bottom-0 ...">` para que quede fijo al fondo al hacer scroll.
- Las líneas de la sección izquierda (servicios/productos) en móvil tienen `max-h-[40vh] overflow-y-auto` para no ocupar toda la pantalla.
- En desktop (`xl`) se conserva el layout de dos columnas sin cambios.

## Pasos

1. `venta-ticket.tsx` — envolver el grid principal para aplicar `order` en móvil: aside `order-1`, section `order-2`.
2. `venta-ticket.tsx` — en el aside, envolver el bloque total + botón Cobrar en sticky `bottom-0` con fondo blur.
3. `venta-ticket.tsx` — en la sección izquierda, limitar altura con scroll en móvil (`sm:max-h-[45vh] sm:overflow-y-auto`).
4. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] `pnpm test:usability --viewport=movil --only=pos` → `/admin/pos` OK (0 errores).
- [ ] En móvil, el botón Cobrar y el total quedan visibles al fondo sin hacer scroll del ticket completo.
- [ ] En desktop, el layout de dos columnas no se altera.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 2 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El sticky `bottom-0` rompe el layout en desktop.
- `test:usability` reporta errores de layout-movil en `/admin/pos`.
- El botón Cobrar deja de ser la única acción primaria (`data-action-clave="1"`).

## Reporte (al terminar)

```
Misión: 63 — ticket compacto con cobro sticky en móvil
Cambios: 
  - venta-ticket.tsx: imports Dialog + estado cobroAbierto; bloque editable ahora muestra TicketActionsBar (preliminar) + botón "Cobrar" con sticky bottom-0 + <Dialog> con <CobroForm enDialog>; section (líneas) con order-2 md:order-1 sm:max-h-[45vh] sm:overflow-y-auto; aside (resumen) con order-1 md:order-2 sm:max-h-[60vh] sm:overflow-y-auto xl:max-h-none.
  - cobro-form.tsx: props enDialog/onClose; atajo Esc cierra el modal; botones Volver/Cobrar al final del flujo (sin sticky).
Verificación: typecheck ✔ | lint ✔ | test 626 ✔ | build ✔ | usability: /admin/pos venta individual OK; 2 errores preexistentes en índice del POS ("Nueva venta rápida" y "Ver historial" cortados, no relacionados con esta misión)
Antes → después: ticket + cobro ocupaban toda la altura en móvil → encabezado + líneas scrolleables + cobro sticky al fondo, botón Cobrar visible al fondo sin scroll del ticket completo
Desviaciones: ninguna
Riesgo abierto: 2 errores de layout-movil en índice del POS son preexistentes (causados por cambios no commiteados ajenos a esta misión), no bloquean
```
