# 51 — Landing y registro más frescos y bonitos

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
Que la landing y el registro de melena se sientan más frescos, bonitos y fáciles de usar: más aire entre secciones, un acento de conversión más vivo y fotos de salón reales que vendan el ambiente del negocio, no solo la interfaz.

**Fuera de alcance\***
Panel `/admin`, POS, caja, inventario, migraciones, dependencias nuevas, deploy, cambios al glosario, cambios a la tipografía mínima del panel.

## Contexto verificado\*

- `src/app/page.tsx:104-344` — Landing: hero con titular, subtítulo, dos CTAs, sección de beneficios, pasos y resumen del día ilustrado con mockup de UI.
- `src/app/registro/page.tsx:10-78` — Registro de dos columnas: formulario a la izquierda, beneficios y footer de marca a la derecha.
- `src/lib/brand.ts:6-36` — `BRAND` y `BRAND_COLORS`: primario bugambilia `#a91d5d`, fondo cálido, sin acento secundario de conversión definido.
- `src/app/globals.css:90-130` — Tokens CSS de modo claro: `--primary`, `--accent`, `--background`, etc.
- `src/components/brand-mark.tsx:17-91` — Isotipo "M fluida" y wordmark, consumido por landing y registro.

## Diseño decidido (si aplica)

- Mantener bugambilia `#a91d5d` como primario de marca; no se toca.
- Agregar un solo acento secundario de conversión (color cálido vivo, tipo amarillo/ámbar) solo para CTAs principales de landing y registro; se define como token en `brand.ts` y `globals.css`, nunca hardcodeado.
- Una sola acción primaria por pantalla (`data-action-clave="1"`).
- Modo claro por defecto; sin cambios al modo oscuro.
- Tipografía mínima 13 px respeta el panel (no aplica a páginas públicas).

## Pasos

1. `src/lib/brand.ts` — agregar token `acentoConversion` (color cálido vivo) sin modificar primario ni fondo.
2. `src/app/globals.css` — definir token CSS `--acento-conversion` y su foreground en `:root`.
3. `src/app/page.tsx` — aumentar espaciado del hero (`py-16` → `py-24` móvil, `py-24` → `py-32` desktop), reducir subtítulo, aplicar acento de conversión al CTA primario "Prueba gratis 14 días", sustituir el mockup de UI del resumen del día por foto de salón real (o agregar foto real junto al resumen).
4. `src/app/registro/page.tsx` — aumentar aire entre secciones, aplicar acento de conversión al botón primario del formulario, agregar foto de salón real en la columna derecha si el layout lo permite sin romper la proporción 2 columnas.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores.
- [ ] `pnpm test:usability --only=landing` → 0 violaciones axe, exactamente 1 `data-action-clave="1"` por pantalla, objetivos táctiles ≥ 24 px.
- [ ] Recorrido manual en 390 px: hero y registro no se cortan; CTA primario visible sin scroll excesivo.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm test:usability --only=landing   (requiere pnpm dev)
# pnpm test:perf                       (si hay dudas de TTFB por imagen nueva)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- Hace falta una acción manual del dueño (Cloudflare, R2, AI Gateway, DNS).
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: 51 — landing y registro más frescos y bonitos
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo, "ninguna".>
