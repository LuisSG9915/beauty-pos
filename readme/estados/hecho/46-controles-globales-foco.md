# 46 — Controles globales: foco y objetivos táctiles

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 4

**Objetivo\***
Los controles base (botón, dialog, sheet) cumplen los objetivos táctiles y muestran anillo de foco consistente en todos los dispositivos.

**Fuera de alcance\***
No se rediseñan los componentes ni se agregan variantes nuevas.

## Contexto verificado\*

- `src/components/ui/button.tsx:24-36` — tamaños xs/sm usan `max-sm:min-h-11` pero no `any-pointer-coarse` en texto.
- `src/components/ui/dialog.tsx:38` y `src/components/ui/sheet.tsx:42` — botón de cierre 36px sin `focus-visible:ring`.
- `src/components/ui/toast.tsx:61` — acción "Deshacer" sin `min-h` explícito (ya corregido en misión 40).

## Diseño decidido (si aplica)

Añadir `any-pointer-coarse:min-h-11` a xs/sm del botón. Añadir anillo de foco a los botones de cierre de dialog/sheet.

## Pasos

1. `button.tsx` — añadir `any-pointer-coarse:min-h-11` a xs/sm.
2. `dialog.tsx` — anillo de foco en el botón de cierre.
3. `sheet.tsx` — anillo de foco en el botón de cierre.

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
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 46 — Controles globales: foco y objetivos táctiles
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

El botón ya incluía `any-pointer-coarse:min-h-11` en todos los tamaños; solo se añadió anillo de foco a los cierres de dialog y sheet.
