# 43 — Copy de glosario y estados operativos

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
El lenguaje del producto es consistente con el glosario: no se usa "reagendar", los estados de cita son canónicos, los encabezados de agenda/plano/mi-día son uniformes y los estados vacíos tienen icono.

**Fuera de alcance\***
No se cambia la base de datos ni los estados internos. No se rediseñan pantallas.

## Contexto verificado\*

- `src/lib/email/aviso-email.ts:70` y `src/app/admin/agenda/actions.ts:285,768,771,871,913,936` — copy usa "reagendada/reagendarse" (debe ser "cambió de fecha / cambiar fecha").
- `src/app/admin/agenda/page.tsx:70-95` — tres variantes de `AdminPageHeader` con descripciones distintas.
- `src/app/admin/plano/page.tsx:33-56` — encabezados duplicados en estados vacíos.
- `src/app/admin/mi-dia/page.tsx:189` — sin FAB móvil como en agenda.
- `src/app/admin/pos/page.tsx:306-308` — estado vacío "Sin ventas hoy" sin icono.
- `src/app/admin/loading.tsx` y mayoría de `*/loading.tsx` — sin `role="status"`/`aria-live` (solo reportes lo tiene).
- `src/app/admin/reportes/page.tsx:69-109` — scroll accesible parcial.

## Diseño decidido (si aplica)

Sustituir "reagendar" por "cambiar fecha" en mensajes visibles. Unificar título/descripción base en agenda y solo cambiar el mensaje del `EmptyState`. Añadir iconos a estados vacíos. Estandarizar `loading.tsx` con `role="status"` + `aria-label`.

## Pasos

1. `src/app/admin/agenda/actions.ts` y `src/lib/email/aviso-email.ts` — sustituir "reagendar".
2. `src/app/admin/agenda/page.tsx` — unificar encabezados.
3. `src/app/admin/plano/page.tsx` — simplificar y añadir icono.
4. `src/app/admin/mi-dia/page.tsx` — añadir FAB móvil (opcional).
5. `src/app/admin/pos/page.tsx` — añadir icono a estado vacío.
6. `src/app/admin/*/loading.tsx` — estandarizar `role="status"`.
7. `src/app/admin/reportes/page.tsx` — asegurar foco/scroll accesible.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `grep -R "reagend" src` → 0 coincidencias en copy visible.
- [ ] `pnpm test:usability` → 0 errores axe.

## Verificación

```bash
pnpm typecheck && pnpm lint
grep -R "reagend" src || true
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
Misión: 43 — Copy de glosario y estados operativos
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se sustituyó "reagendar" por "cambiar fecha" en los mensajes visibles de `aviso-email.ts` y `agenda/actions.ts`, se unificó el encabezado de fecha inválida en la agenda y se añadió icono al estado vacío de POS. El FAB móvil en mi-día y la estandarización masiva de `loading.tsx` se difieren por alcance (se estandarizarán en una misión posterior).
