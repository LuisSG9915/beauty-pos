# 40 — Componentes compartidos: accesibilidad y consistencia

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Los componentes reutilizables del panel (combobox, field, loading, empty state, stat card, banner de suscripción, vista adaptativa, admin shell) son accesibles y consistentes: anillos de foco unificados, `aria-busy`/`role="status"`, contraste de iconos, KPIs sin truncar y z-index correcto.

**Fuera de alcance\***
No se tocan páginas específicas ni la lógica de datos. No se agregan nuevas dependencias.

## Contexto verificado\*

- `src/components/ui/remote-combobox.tsx:273-280` — copy hardcodeado "Cliente seleccionado" y sin prop `error`.
- `src/components/ui/combobox.tsx:94-98` — label manual sin `aria-required` en el input.
- `src/components/ui/field.tsx:43` — `focus:ring-2` vs `focus-visible:ring-3` del botón (inconsistencia de foco).
- `src/components/loading-state.tsx:25` — skeleton `bg-card` de bajo contraste; sin `aria-busy`.
- `src/components/empty-state.tsx:28` — icono `text-primary/70` puede fallar contraste en dark.
- `src/components/admin/stat-card.tsx:31` — `truncate` en el valor puede ocultar KPIs largos.
- `src/components/admin/subscription-banner.tsx:50-109` — sin `role="status"`/`aria-live`.
- `src/components/admin/vista-adaptativa.tsx:25` — asume exactamente 2 hijos; rompe si se usa mal.
- `src/components/admin/admin-shell.tsx:738` — header móvil y tab bar con mismo `z-40`.

## Diseño decidido (si aplica)

Unificar foco a `focus-visible:ring-3 focus-visible:ring-ring/50`. Añadir `role="status"`/`aria-live="polite"` al banner. Validar número de hijos en `VistaAdaptativa` con fallback. Subir header móvil a `z-30` y tab bar a `z-40`.

## Pasos

1. `src/components/ui/remote-combobox.tsx` — prop `selectedLabel` y soporte `error`.
2. `src/components/ui/combobox.tsx` — propagar `aria-required` al input.
3. `src/components/ui/field.tsx` — unificar anillo de foco.
4. `src/components/loading-state.tsx` — skeleton `bg-muted/60` + `aria-busy="true"`.
5. `src/components/empty-state.tsx` — icono `text-primary` (o `text-muted-foreground`).
6. `src/components/admin/stat-card.tsx` — `break-words`/`line-clamp-2` + `aria-label`.
7. `src/components/admin/subscription-banner.tsx` — `role="status"` en el contenedor.
8. `src/components/admin/vista-adaptativa.tsx` — validar `Children.count` y fallback.
9. `src/components/admin/admin-shell.tsx` — ajustar z-index header/tab bar.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability` → 0 errores axe en páginas afectadas.
- [ ] Recorrido manual: foco visible consistente; toasts/banner no se tapan.

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
Misión: 40 — Componentes compartidos: accesibilidad y consistencia
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
