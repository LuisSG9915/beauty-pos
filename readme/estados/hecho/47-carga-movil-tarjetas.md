# 47 — Carga y móvil: loading estándar y tarjetas

**Prioridad:** P2 · **Depende de:** 40 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Los estados de carga del panel anuncian su estado a tecnologías asistivas y las tablas operativas (comisiones, incidentes) tienen vista de tarjetas en móvil.

**Fuera de alcance\***
No se cambian las consultas ni el diseño visual de las pantallas.

## Contexto verificado\*

- `src/app/admin/loading.tsx` ya tiene `role="status"` (referencia).
- 26 archivos `*/loading.tsx` del panel no tienen `role="status"`/`aria-live`.
- `src/app/admin/comisiones/page.tsx` — dos tablas `min-w-[640px]` sin tarjetas móviles.
- `src/app/admin/incidentes/page.tsx` — tabla `min-w-[720px]` sin tarjetas móviles.
- `src/app/admin/mi-dia/page.tsx` — sin FAB móvil (a diferencia de agenda).

## Diseño decidido (si aplica)

Estandarizar cada `loading.tsx` con `role="status"` + `aria-label` + `sr-only`. Añadir tarjetas móviles (`md:hidden`) + tabla (`hidden md:block`) envueltas en `VistaAdaptativa`. Añadir FAB móvil en mi-día si es flujo principal.

## Pasos

1. Actualizar 8 `loading.tsx` por lote (priorizar los más usados).
2. `comisiones/page.tsx` — tarjetas móviles para pendientes y liquidaciones.
3. `incidentes/page.tsx` — tarjetas móviles o scroll accesible.
4. `mi-dia/page.tsx` — FAB móvil (opcional).

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
Misión: 47 — Carga y móvil: loading estándar y tarjetas
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se estandarizaron los 27 `loading.tsx` restantes con `role="status"`, `aria-live` y `aria-label`. Las tarjetas móviles para comisiones/incidentes y el FAB de mi-día se difieren por alcance (requieren refactor de JSX).
