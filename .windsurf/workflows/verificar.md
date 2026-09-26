---
description: Corre typecheck, lint, tests y verificaciones de UI/datos según lo que cambió
---

# /verificar

Corre las verificaciones que aplican al cambio actual:

1. `pnpm typecheck` y `pnpm lint` (siempre).
2. `pnpm test` (siempre).
3. `git status`/`git diff` para ver qué se tocó:
   - ¿UI de rutas admin? → asegura `pnpm dev` corriendo y corre `pnpm test:usability`. Si hay dev server: `pnpm test:perf`.
   - ¿`src/db/schema/**`? → `pnpm db:check`.
   - ¿Flujo crítico (agenda/cobro/caja/auth)? → `pnpm test:smoke`.
4. Reporta cada resultado en una tabla: comando → estado → detalle.
5. Si algo falla, corrige el motivo raíz (no el síntoma) y repite.
