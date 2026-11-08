# 65 — POS: diseño de línea de servicio/producto (jerarquía visual clara)

**Prioridad:** P1 · **Depende de:** 62, 63, 64 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 1

**Objetivo**
Pulir visualmente la línea de servicio/producto del ticket (`TicketLine`) con jerarquía visual clara: nombre destacado, precio unitario secundario, importe en negrita a la derecha, cantidad como chip separado, acciones como iconos sutiles y más aire entre elementos. Coincide con la opción B elegida por el usuario.

**Fuera de alcance**
No se cambia la lógica de acciones (cambiar cantidad, quitar, asignar profesional, usar paquete). No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:157-345` — componente `TicketLine`. Hoy renderiza nombre (text-sm font-medium), precio c/u (text-op-xs), controles de cantidad integrados con botones size-11, importe a la derecha, dropdown de profesional, y botón paquete. Funcionalmente completo pero sin jerarquía visual clara.

## Diseño decidido (opción B)

- Nombre: `text-base font-semibold` (más destacado que hoy text-sm).
- Precio c/u: `text-op-xs font-medium text-muted-foreground`, en línea de base con el nombre (`items-baseline`).
- Importe: `text-sm font-bold tabular-nums` a la derecha, más destacado.
- Cantidad: chip separado `rounded-xl border border-border bg-muted/30` con botones - / + pequeños (`size-8`) y número centrado.
- Quitar: `Button` ghost `size-9` con icono Trash2, sutil (solo visible al hover).
- Más aire: `p-4 sm:p-5`, gap mayor entre nombre e importe.
- Profesional y paquete conservan su funcionalidad con estilo ligeramente más limpio.

## Pasos

1. `venta-ticket.tsx` — reescribir el JSX de `TicketLine` aplicando la jerarquía visual clara (opción B).
2. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] La línea muestra jerarquía clara: nombre grande, importe negrita a la derecha, cantidad en chip separado, acciones sutiles.
- [ ] Funcionalidad preservada: cambiar cantidad, quitar, asignar profesional, usar paquete siguen funcionando.

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

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos`.
- La lógica de acciones se rompe.

## Reporte (al terminar)

```
Misión: 65 — diseño línea de servicio jerarquía clara
Cambios: venta-ticket.tsx: TicketLine reescrito con nombre text-base font-semibold, precio c/u secundario, importe text-sm font-bold a la derecha, cantidad en chip separado con botones size-8, quitar como Button ghost size-9, p-4 sm:p-5.
Verificación: typecheck ✔ | lint ✔ | test 626 ✔ | build ✔ | usability OK
Antes → después: línea sin jerarquía clara → nombre destacado, importe negrita, cantidad chip, acciones sutiles
Desviaciones: ninguna
Riesgo abierto: ninguno
```
