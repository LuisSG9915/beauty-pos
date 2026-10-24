---
trigger: always_on
---

# Verificación obligatoria antes de dar por terminado

1. `pnpm typecheck` — 0 errores.
2. `pnpm lint` — 0 errores (warnings solo si son preexistentes).
3. `pnpm test` — suite completa en verde.
4. Si tocaste UI de rutas admin: `pnpm test:usability` con `pnpm dev` corriendo (0 errores, 0 avisos) y `pnpm test:perf` si afecta navegación/BD.
5. Si tocaste esquema: `pnpm db:check`.
6. Cambios de flujos críticos (agenda, cobro, caja): smoke `pnpm test:smoke` o recorrido manual con Puppeteer.

No declares "listo" sin correr lo que aplique. Si una verificación no puede correr en el entorno, dilo explícitamente.

<!-- Generado por scripts/sync-reglas.ts desde .windsurf/rules; no editar a mano. -->
