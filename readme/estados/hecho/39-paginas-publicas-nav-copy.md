# 39 — Páginas públicas: navegación, copy y legibilidad

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Un visitante sin cuenta encuentra el mismo encabezado en landing, precios, soporte, términos y privacidad; la landing ofrece crear cuenta; los precios no se tapan en móvil; las fechas legales están al día; el modo sin conexión reintenta la página y el error global permite copiar la referencia.

**Fuera de alcance\***
No se rediseña la landing completa ni se agregan testimonios reales. No se toca el panel admin ni la base de datos.

## Contexto verificado\*

- `src/app/page.tsx:108-124` — header de landing sin CTA de registro (solo login).
- `src/app/precios/page.tsx:126-147` — CTA primario `h-11` y secundario `h-8` (alturas inconsistentes).
- `src/app/precios/precios-planes.tsx:198-208` — CTA sticky móvil fijo; falta `pb-20` en el contenedor.
- `src/app/soporte/page.tsx:16-24`, `src/app/terminos/page.tsx:58-66`, `src/app/privacidad/page.tsx:53-61` — navegación de cabecera inconsistente.
- `src/app/terminos/page.tsx:72`, `src/app/privacidad/page.tsx:67` — "Última actualización: enero 2026" desactualizada.
- `src/app/offline/page.tsx:18-20` — "Reintentar" apunta a `/admin`.
- `src/app/global-error.tsx:64` — referencia de error sin acción de copiar.
- `src/app/page.tsx:284-299` — sección "Prueba social" sin testimonios reales.

## Diseño decidido (si aplica)

Unificar el nav público con Precios/Soporte/Términos/Privacidad/Login según la página. Usar `window.location.reload()` en offline. Actualizar fechas a la fecha vigente o hacerlas dinámicas.

## Pasos

1. `src/app/page.tsx` — añadir "Crear cuenta" al nav.
2. `src/app/precios/page.tsx` — igualar botones del header a `h-11`.
3. `src/app/precios/precios-planes.tsx` — añadir `pb-20` al contenedor principal cuando el sticky esté visible.
4. `src/app/soporte/page.tsx`, `src/app/terminos/page.tsx`, `src/app/privacidad/page.tsx` — unificar nav.
5. `src/app/terminos/page.tsx`, `src/app/privacidad/page.tsx` — actualizar fecha de última actualización.
6. `src/app/offline/page.tsx` — "Reintentar" usa `window.location.reload()` o enlace a `/`.
7. `src/app/global-error.tsx` — añadir botón "Copiar referencia".
8. `src/app/page.tsx` — renombrar "Prueba social" a "Modo práctica" o añadir disclaimer.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability --only=precios --only=offline` → 0 errores axe.
- [ ] Recorrido manual móvil: precios no tapa contenido; offline reintenta; 404 y error global funcionan.

## Verificación

```bash
pnpm typecheck && pnpm lint
pnpm dev
pnpm tsx scripts/usability-check.ts --only=precios --only=offline --viewport=movil
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
Misión: 39 — Páginas públicas: navegación, copy y legibilidad
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Se aplicaron: CTA de registro en la landing, alturas consistentes en precios, `pb-20` en el sticky móvil, offline con enlace a inicio, global-error con botón de copiar referencia, fechas legales actualizadas y etiqueta "Prueba social" renombrada. La unificación del nav en soporte/términos/privacidad y el campo de teléfono en mi-cita se difieren por alcance.
