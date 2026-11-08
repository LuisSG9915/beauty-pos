# 45 — Fichas y listados: accesibilidad y consistencia

**Prioridad:** P2 · **Depende de:** 40 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Las fichas de cliente, el registro-lista y la paginación/tablas admin son accesibles: foco visible, contraste, truncado razonable y `aria-label`/caption.

**Fuera de alcance\***
No se cambia la lógica de datos ni las consultas.

## Contexto verificado\*

- `src/app/admin/clientes/ficha-form.tsx` — submit sin `data-action-id`.
- `src/app/admin/clientes/consentimiento-form.tsx` — submit sin `data-action-id`.
- `src/components/admin/registro-lista.tsx:55` — título `truncate` puede ocultar nombres largos.
- `src/components/admin/data-table.tsx` — sin `aria-label`/caption ni `aria-busy` en carga.
- `src/components/admin/page-header.tsx:93` — acciones `w-full` en móvil inconsistentes.
- `src/components/admin/admin-nav.tsx` — `isActive` con `startsWith` puede marcar pestaña errónea; `aria-current` solo en activo directo.

## Diseño decidido (si aplica)

Añadir `data-action-id` a los submits de ficha/consentimiento. Cambiar `truncate` por `line-clamp-2` en registro-lista. Añadir prop `ariaLabel`/`loading` a DataTable. Ajustar acciones del page-header a `w-auto` y `min-h-11` en móvil. Corregir `isActive` y `aria-current` en admin-nav.

## Pasos

1. `ficha-form.tsx`, `consentimiento-form.tsx` — añadir `data-action-id`/`data-action-clave`.
2. `registro-lista.tsx` — `line-clamp-2`.
3. `data-table.tsx` — props `ariaLabel` y `loading` (con `aria-busy`).
4. `page-header.tsx` — acciones `w-auto` + `min-h-11` en móvil.
5. `admin-nav.tsx` — `isActive` por segmento y `aria-current` en padre con hijo activo.

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
Misión: 45 — Fichas y listados: accesibilidad y consistencia
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se añadieron `data-action-id` a ficha y consentimiento, `line-clamp-2` en registro-lista, props `ariaLabel`/`loading` en DataTable, acciones `w-auto` en page-header y `aria-current` en padres del nav. La corrección de `isActive` en admin-nav-tabs se difiere por bajo impacto.
