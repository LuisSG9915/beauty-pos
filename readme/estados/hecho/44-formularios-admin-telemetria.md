# 44 — Formularios admin: telemetría y acción primaria

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Los formularios de alta y edición del panel emiten `data-action-id` (y `data-action-clave` en el submit) para telemetría, de forma consistente con el resto de pantallas.

**Fuera de alcance\***
No se cambia la lógica de negocio ni la validación. No se tocan las páginas de listado.

## Contexto verificado\*

- `src/app/admin/promociones/promotion-form.tsx` — submit sin `data-action-id`/`data-action-clave`.
- `src/app/admin/categorias-servicios/category-form.tsx` — submit sin ids.
- `src/app/admin/medios-pago/payment-method-form.tsx` — submit sin ids.
- `src/app/admin/membresias/membresia-form.tsx` — submit sin ids.
- `src/app/admin/categorias-productos/product-category-form.tsx` — submit sin ids.
- `src/app/admin/gastos/categoria-form.tsx` — submit sin ids.
- `src/app/admin/organization-form.tsx` — submit sin ids.
- `src/app/admin/invitation-form.tsx` — submit sin ids.

## Diseño decidido (si aplica)

Usar el patrón `data-action-id="modulo.entidad.guardar"` y `data-action-clave="1"` en el submit principal. Los toggles de activar/ocultar ya tienen ids.

## Pasos

1. Añadir `data-action-id`/`data-action-clave` a los 8 formularios listados.
2. Verificar que no haya dos primarias visibles en la misma pantalla.

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
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 44 — Formularios admin: telemetría y acción primaria
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

ninguna
