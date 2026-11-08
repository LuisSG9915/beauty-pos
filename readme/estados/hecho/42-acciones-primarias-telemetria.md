# 42 — Acciones primarias y telemetría en admin

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Cada pantalla admin tiene una sola acción primaria visible y todos los formularios/botones clave emiten `data-action-id`/`data-action-clave` para telemetría; se eliminan primarias duplicadas en sucursales y compras.

**Fuera de alcance\***
No se cambia la lógica de negocio de sucursales, compras ni filtros. No se toca el backend.

## Contexto verificado\*

- `src/app/admin/sucursales/page.tsx:187-197` — dos botones con `data-action-clave="1"` en ramas mutuamente excluyentes.
- `src/app/admin/compras/[id]/compra-detalle.tsx:629,929,958` — múltiples `data-action-clave` condicionales en la misma pantalla.
- `src/app/admin/ventas/page.tsx:295`, `src/app/admin/promociones/page.tsx:200`, `src/app/admin/servicios/page.tsx:330`, `src/app/admin/medios-pago/page.tsx:76`, `src/app/admin/membresias/page.tsx:183` — botones "Filtrar/Buscar" sin `data-action-id`.
- `src/app/admin/promociones/promotion-form.tsx`, `src/app/admin/categorias-servicios/category-form.tsx`, `src/app/admin/medios-pago/payment-method-form.tsx`, `src/app/admin/membresias/membresia-form.tsx`, `src/app/admin/categorias-productos/product-category-form.tsx`, `src/app/admin/gastos/categoria-form.tsx`, `src/app/admin/organization-form.tsx`, `src/app/admin/invitation-form.tsx`, `src/app/admin/clientes/ficha-form.tsx`, `src/app/admin/clientes/consentimiento-form.tsx` — submits sin `data-action-id`/`data-action-clave`.
- `src/app/admin/unidades-medida/page.tsx:56`, `src/app/admin/impuestos/page.tsx:49`, `src/app/admin/categorias-productos/page.tsx:56` — "Nuevo …" sin `data-action-id` en algunos.
- `src/app/admin/practica/practica-flow.tsx` — 4× `data-action-clave` en un flujo guiado.
- `src/app/admin/agenda/agenda-board.tsx:555,623` — dos `data-action-clave` (desktop + FAB móvil) con el mismo id.

## Diseño decidido (si aplica)

Mantener exclusión mutua documentada en compras/sucursales. Añadir `data-action-id` a filtros y submits. En agenda, diferenciar ids `...desktop`/`...fab` para telemetría.

## Pasos

1. `src/app/admin/sucursales/page.tsx`, `src/app/admin/compras/[id]/compra-detalle.tsx` — verificar exclusión mutua y documentar matriz.
2. `src/app/admin/ventas/page.tsx`, `promociones/page.tsx`, `servicios/page.tsx`, `medios-pago/page.tsx`, `membresias/page.tsx` — añadir `data-action-id` a filtros.
3. Formularios listados — añadir `data-action-id`/`data-action-clave` a submits.
4. `src/app/admin/unidades-medida/page.tsx`, `impuestos/page.tsx`, `categorias-productos/page.tsx` — añadir `data-action-id`.
5. `src/app/admin/practica/practica-flow.tsx` — una primaria por paso.
6. `src/app/admin/agenda/agenda-board.tsx` — diferenciar ids desktop/fab.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability` → 0 errores axe.
- [ ] Auditoría manual: una primaria por pantalla en sucursales, compras, POS.

## Verificación

```bash
pnpm typecheck && pnpm lint
pnpm dev
pnpm tsx scripts/usability-check.ts --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 42 — Acciones primarias y telemetría en admin
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se añadió `data-action-id` a los filtros de ventas, promociones, servicios, medios de pago y membresías, y se diferenciaron los ids del botón "Nueva cita" (desktop/fab) en la agenda. Sucursales y compras ya cumplen exclusión mutua por rama/estado. Los formularios de alta/edición (promotion-form, ficha-form, etc.) se difieren a una misión posterior por alcance.
