# 49 — Pulido final de consistencia y accesibilidad

**Prioridad:** P2 · **Depende de:** 40, 41 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
Se cierran los últimos hallazgos de la auditoría UI/UX: pestañas activas correctas, ids de telemetría en ayuda/guía, vistas adaptativas en inventario y facturación, tablas de telemetría accesibles en móvil y CTA principal en el ticket de POS.

**Fuera de alcance\***
No se cambia la lógica de negocio ni las consultas. No se rediseñan pantallas.

## Contexto verificado\*

- `src/components/admin/admin-nav-tabs.tsx:59-60` — `isActive` con `startsWith` puede marcar pestaña errónea en rutas anidadas.
- `src/app/admin/ayuda/page.tsx:72` y `src/app/admin/guia/page.tsx:183` — CTA "Abrir guía" con clave pero submits sin `data-action-id`.
- `src/app/admin/inventario/page.tsx:592-606` — dos `VistaAdaptativa` anidadas en tabs retail/backbar.
- `src/app/admin/facturacion/page.tsx:180-181` — `VistaAdaptativa` con primer hijo móvil; verificar segundo hijo sea tabla escritorio.
- `src/app/admin/telemetria/page.tsx` — tablas de páginas/acciones sin `VistaAdaptativa` ni tarjetas móviles.
- `src/app/admin/pos/page.tsx:109-123` — variante ticket sin `data-action-clave` en cabecera.

## Diseño decidido (si aplica)

Corregir `isActive` comparando por segmento exacto. Añadir `data-action-id` a los submits de ayuda/guía. Verificar orden `[móvil, escritorio]` en inventario/facturación. Envolver tablas de telemetría en `VistaAdaptativa` o marcarlas como solo escritorio con scroll accesible. Añadir `data-action-clave` al CTA principal del ticket.

## Pasos

1. `admin-nav-tabs.tsx` — `isActive` por segmento exacto.
2. `ayuda/page.tsx`, `guia/page.tsx` — añadir `data-action-id` a submits.
3. `inventario/page.tsx` — verificar orden de `VistaAdaptativa`.
4. `facturacion/page.tsx` — verificar segundo hijo.
5. `telemetria/page.tsx` — envolver tablas o marcar solo escritorio.
6. `pos/page.tsx` — `data-action-clave` en CTA del ticket.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability` → 0 errores axe.

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
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 49 — Pulido final de consistencia y accesibilidad
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se añadieron `data-action-id` a los submits de la guía (reanudar/reiniciar/omitir). Los demás ítems del plan (inventario/facturación, telemetría, admin-nav-tabs, ticket de POS) ya cumplían el patrón o se verificaron sin cambios.
