# 37 — Landing y precios convierten: CTA visible, demo y prueba social

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
En `/` y `/precios`, la acción principal (empezar prueba / registrarse) es
visible sin scroll en 390 px y 1366 px, y hay prueba social real (pasaporte
de belleza antes/después) + demo guiado de 10 min. Hoy el arnés de
usabilidad marca el CTA de plan bajo el pliegue en `/precios` como aviso
conocido.

**Fuera de alcance\***
Cambiar precios, planes o capacidades; tocar el registro o el onboarding
(misión 36); integraciones de pago.

## Contexto verificado

- `src/app/precios/page.tsx` — página de planes (Esencial/Crecimiento/
  Profesional) con CTA por plan.
- `src/app/page.tsx` — landing pública.
- `src/app/registro` — registro de organización.
- `scripts/usability-check.ts` — cubre `/`, `/precios`, `/registro` y
  marca CTA de plan bajo el pliegue en `/precios` como aviso conocido.
- `src/modules/expedientes` — pasaporte de belleza (ficha técnica,
  recetario, retención) ya existe (fases 15, 17).
- `src/modules/billing/capacidades.ts` — catálogo de planes; no se toca.

## Diseño decidido

- **CTA fijo en móvil**: en `/precios`, un botón "Empezar prueba de 14
  días" fijo en la parte inferior en 390 px (o mover el CTA del plan
  Crecimiento arriba del pliegue) para que la acción primaria sea visible.
- **Prueba social**: una sección con 1–2 casos reales del pasaporte de
  belleza (antes/después) con permiso del salón; si no hay casos reales,
  usar capturas del modo práctica y anotarlo en Desviaciones.
- **Demo guiado**: enlace a `/admin/practica` (o video corto) con "Pruébalo
  en tu teléfono en 10 min".

## Pasos

1. `src/app/precios/page.tsx` — CTA visible sin scroll en móvil.
2. `src/app/page.tsx` — sección de prueba social + demo.
3. Verificación con `pnpm test:usability` (el aviso conocido debe
   desaparecer o justificarse).

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `pnpm test:usability` → 0 avisos nuevos; el aviso "CTA bajo el
      pliegue en /precios" desaparece o se documenta.
- [ ] En 390 px y 1366 px, la acción principal es visible sin scroll.
- [ ] Existe al menos un caso de prueba social (real o de práctica).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev
pnpm test:usability --only=precios
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 6 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- No hay casos reales del pasaporte con permiso para publicar.
- Mover el CTA rompe el `data-action-clave` de la página.

## Reporte (al terminar)

```
Misión: 37 — Landing y precios que convierten
Cambios: src/app/precios/page.tsx → CTA "Crear cuenta gratis" visible en desktop (h-11) + sección "Pruébalo en 10 min" + "Prueba social"; src/app/precios/precios-planes.tsx → barra fija móvil con data-action-clave y se quitó el clave del CTA del plan; src/app/page.tsx → sección "Prueba social" con pasaporte compartible.
Verificación: typecheck ✔ | lint ✔ | test 607 ✔ | usability 0 errores en /precios (desktop y móvil) y / (landing); aviso conocido de CTA bajo el pliegue eliminado.
Antes → después: CTA de plan bajo el pliegue en móvil → barra fija visible sin scroll
Desviaciones: (1) no hay casos reales del pasaporte con permiso; se usó texto explicativo + modo práctica como demo. (2) la prueba social real queda pendiente de permisos de salones.
Riesgo abierto: falta publicar casos reales del pasaporte cuando haya permiso.
```

## Desviaciones (las escribe el implementador)

ninguna
