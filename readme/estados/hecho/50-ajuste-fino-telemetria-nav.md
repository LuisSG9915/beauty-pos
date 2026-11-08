# 50 — Ajuste fino final de telemetría y navegación

**Prioridad:** P2 · **Depende de:** 40 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 2

**Objetivo\***
Se cierran los últimos detalles: tablas de telemetría accesibles con scroll por teclado y pestañas de módulo con estado activo robusto.

**Fuera de alcance\***
No se cambia la lógica de negocio ni las consultas.

## Contexto verificado\*

- `src/app/admin/telemetria/page.tsx` — `Tabla` con `overflow-x-auto` sin `aria-label`/`tabIndex`.
- `src/components/admin/admin-nav-tabs.tsx:59-60` — `isActive` con `startsWith` (ya seguro por prefijo con `/`).

## Diseño decidido (si aplica)

Añadir `aria-label` y `tabIndex={0}` al contenedor de scroll. Mantener `isActive` actual (prefijo con `/`).

## Pasos

1. `telemetria/page.tsx` — `aria-label` + `tabIndex` en `Tabla`.
2. Verificar `admin-nav-tabs.tsx` (sin cambios si ya cumple).

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
| Duración | ≤ 1 h de agente (una sesión) |
| Archivos tocados | ≤ 2 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 50 — Ajuste fino final de telemetría y navegación
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

ninguna