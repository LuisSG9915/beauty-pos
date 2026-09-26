---
trigger: glob
globs: src/app/**/*.tsx,src/components/**/*.tsx,src/app/globals.css
---

# UI para gente no técnica (salones de belleza)

El usuario final suele tener poca experiencia con tecnología. Al escribir UI:

- **Vocabulario**: usar solo los términos de `src/lib/glosario.ts` (fuente única). Prohibido: "walk-in" (→ "cliente de paso"), "reagendar" (→ "cambiar fecha"), UUIDs visibles, nombres de estado internos (`en_proceso` → "en curso"/"ya llegó"), jerga técnica (timezone, slug, token).
- **Estados de cita**: la presentación vive en `src/modules/agenda/estados.ts` (etiqueta + tono + icono). Nunca duplicar mapas de estado en componentes; el color dominante de una cita es su ESTADO, el color de categoría solo es la franja secundaria.
- **Color**: usar los tokens semánticos de `globals.css` (`--cita-*`, `--success/-soft`, `--warning/-soft`, etc.). Para texto sobre fondo suave usar el par `-soft` diseñado (p. ej. `bg-success-soft text-success`), nunca `bg-success/10 text-success` (contraste < 4.5).
- **Tipografía**: mínimo operativo `text-op-xs` (13px). Prohibido `text-[9px|10px|11px]`.
- **Tema**: `/admin` arranca en claro por defecto; el usuario puede elegir sistema/claro/oscuro (`src/lib/theme-preference.ts`). Mantener el bootstrap sin flash.
- **Touch**: objetivos táctiles ≥ 24px (los operativos ~44px+). En móvil, acciones grandes con verbos ("Cobrar", "Nueva cita").
- **Accesibilidad**: WCAG AA; foco visible, `aria-label` en iconos-botón, `sr-only` para estados solo visuales, respetar `prefers-reduced-motion`.
- **Formato**: usar los helpers memoizados de `src/lib/format.ts`; no crear `Intl.*` por celda.
