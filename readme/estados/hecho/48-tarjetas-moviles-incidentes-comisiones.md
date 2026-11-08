# 48 — Tarjetas móviles en incidentes y comisiones

**Prioridad:** P2 · **Depende de:** 40, 41 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 4

**Objetivo\***
En móvil, incidentes y comisiones muestran tarjetas legibles en lugar de scroll horizontal, manteniendo la tabla en escritorio.

**Fuera de alcance\***
No se cambian las consultas ni los filtros. No se rediseñan las tarjetas de escritorio.

## Contexto verificado\*

- `src/app/admin/incidentes/page.tsx` — tabla `min-w-[720px]` sin layout móvil.
- `src/app/admin/comisiones/page.tsx` — dos tablas `min-w-[640px]` sin layout móvil.
- `src/components/admin/vista-adaptativa.tsx` — patrón `[móvil, escritorio]`.

## Diseño decidido (si aplica)

Envolver en `VistaAdaptativa` con lista de tarjetas (`md:hidden`) + tabla (`hidden md:block`), siguiendo el patrón de clientes/ventas.

## Pasos

1. `incidentes/page.tsx` — tarjetas móviles con prioridad, título, estado, ocurrencias y fecha.
2. `comisiones/page.tsx` — tarjetas móviles para pendientes y liquidaciones.
3. Verificar accesibilidad (axe) en móvil.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability --only=incidentes --only=comisiones --viewport=movil` → 0 errores axe.
- [ ] Recorrido manual móvil: sin scroll horizontal agresivo.

## Verificación

```bash
pnpm typecheck && pnpm lint
pnpm dev
pnpm tsx scripts/usability-check.ts --only=incidentes --only=comisiones --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 48 — Tarjetas móviles en incidentes y comisiones
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se implementaron tarjetas móviles para incidentes y para ambas listas de comisiones (pendientes y liquidaciones), manteniendo la tabla en escritorio mediante `VistaAdaptativa`. La verificación de usabilidad no pudo ejecutarse por un error de autenticación del usuario E2E (ajeno al cambio).
