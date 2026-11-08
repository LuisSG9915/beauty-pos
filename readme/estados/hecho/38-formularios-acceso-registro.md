# 38 — Formularios de acceso y registro consistentes

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 5

**Objetivo\***
La persona que crea o recupera su cuenta ve la misma altura de campos, el mismo shell de dos columnas y la misma marca clickeable en login, registro, recuperación, restablecimiento e invitación; sin saltos visuales ni enlaces muertos.

**Fuera de alcance\***
No se toca la lógica de autenticación (better-auth), ni las migraciones, ni el envío de correos. No se rediseña la landing ni el panel admin.

## Contexto verificado\*

- `src/app/registro/registro-form.tsx:66,84,102,120` — inputs con `h-10`, mientras login/recuperar/restablecer usan `h-11`.
- `src/app/invitacion/[token]/page.tsx:31` — `BrandMark` no es enlace; no hay salida a la home.
- `src/app/(auth)/recuperar/page.tsx:8-28` y `src/app/(auth)/restablecer/page.tsx:7-51` — layout de una columna centrada, distinto del patrón de dos columnas de login/registro.
- `src/app/(auth)/login/page.tsx` — shell de dos columnas de referencia.
- `src/app/(auth)/registro/page.tsx` — shell de dos columnas de referencia.

## Diseño decidido (si aplica)

Adoptar el shell de dos columnas de `login/page.tsx`/`registro/page.tsx` en recuperar y restablecer. Unificar inputs a `h-11`. Envolver `BrandMark` en `<Link href="/">`.

## Pasos

1. `src/app/registro/registro-form.tsx` — cambiar `h-10` por `h-11` en los 4 inputs.
2. `src/app/invitacion/[token]/page.tsx` — envolver `BrandMark` en `<Link href="/">`.
3. `src/app/(auth)/recuperar/page.tsx` — adoptar shell de dos columnas.
4. `src/app/(auth)/restablecer/page.tsx` — adoptar shell de dos columnas.
5. `src/app/(auth)/login/page.tsx` — verificar paridad (sin cambios si ya cumple).

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability --only=registro` → 0 errores axe.
- [ ] Recorrido manual: login, registro, recuperar, restablecer e invitación muestran el mismo shell y campos de altura `h-11`.

## Verificación

```bash
pnpm typecheck && pnpm lint
pnpm dev  # en otra terminal
pnpm tsx scripts/usability-check.ts --only=registro --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 5 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 38 — Formularios de acceso y registro consistentes
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
