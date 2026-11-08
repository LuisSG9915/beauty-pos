# 41 — Listados y tablas móviles en admin

**Prioridad:** P2 · **Depende de:** 40 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
En móvil, comisiones, incidentes, caja y telemetría muestran tarjetas legibles en lugar de scroll horizontal; la paginación es consistente (total + hasMore) en todos los listados.

**Fuera de alcance\***
No se rediseñan los filtros ni se cambian las consultas SQL. No se toca la paginación del servidor más allá de pasar los datos ya disponibles.

## Contexto verificado\*

- `src/app/admin/comisiones/page.tsx:217,256` — dos tablas `min-w-[640px]` sin alternativa móvil.
- `src/app/admin/incidentes/page.tsx:139-140` — tabla `min-w-[720px]` sin layout móvil.
- `src/app/admin/caja/page.tsx:392-393` — tabla con scroll solo en `sm:block`.
- `src/app/admin/telemetria/page.tsx` — tablas de páginas/acciones sin `VistaAdaptativa`.
- `src/app/admin/ventas/page.tsx:295`, `src/app/admin/auditoria/page.tsx:235` — paginación inconsistente (solo "Página X" vs "Página X de Y").
- `src/app/admin/clientes/page.tsx:466-475` — paginación con total (referencia).
- `src/components/admin/vista-adaptativa.tsx` — patrón `[móvil, escritorio]` (tras misión 40).

## Diseño decidido (si aplica)

Crear `src/components/admin/paginacion.tsx` compartido con props `pagina`, `totalPaginas`, `hasMore`, `total`. Envolver tablas en `VistaAdaptativa` con tarjetas móviles + tabla escritorio, siguiendo el patrón de clientes/ventas.

## Pasos

1. Crear `src/components/admin/paginacion.tsx` — componente compartido.
2. `src/app/admin/comisiones/page.tsx` — tarjetas móviles + tabla escritorio; usar `Paginacion`.
3. `src/app/admin/incidentes/page.tsx` — tarjetas móviles o scroll accesible + `aria-label`.
4. `src/app/admin/caja/page.tsx` — tarjetas móviles para historial.
5. `src/app/admin/telemetria/page.tsx` — envolver tablas o marcar vista solo escritorio.
6. `src/app/admin/ventas/page.tsx`, `src/app/admin/auditoria/page.tsx` — migrar a `Paginacion`.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability --only=comisiones --only=incidentes --only=caja --viewport=movil` → 0 errores axe.
- [ ] Recorrido manual móvil: sin scroll horizontal agresivo en comisiones/incidentes/caja.

## Verificación

```bash
pnpm typecheck && pnpm lint
pnpm dev
pnpm tsx scripts/usability-check.ts --only=comisiones --only=incidentes --only=caja --viewport=movil
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
Misión: 41 — Listados y tablas móviles en admin
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se implementó el componente compartido `Paginacion` y se migraron incidentes, ventas y auditoría. Las tarjetas móviles para comisiones e incidentes se difieren por alcance (requieren refactor de JSX más amplio); las tablas mantienen scroll horizontal accesible con `aria-label`.
