---
description: Despliega el Worker a Cloudflare con las verificaciones y el binding Hyperdrive correctos
---

# /deploy

1. Verificación previa: `pnpm typecheck`, `pnpm lint`, `pnpm test`. No desplegar con nada roto.
2. Exportar el binding local de Hyperdrive desde `.env`:
   ```bash
   export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(python3 -c "import re;print(re.search(r'^DATABASE_URL=(.*)$',open('.env').read(),re.M).group(1))")"
   ```
3. `pnpm run deploy` (NUNCA `pnpm deploy` a secas — es el comando de pnpm y falla).
4. Tras desplegar, verificar `https://melena.app/api/health` (200) y una navegación de agenda.
5. Si hay migraciones pendientes, aplicarlas ANTES de desplegar (`pnpm db:migrate`) y mencionarlas en el reporte.

Reporta: versión desplegada, checks corridos, y si KV/bindings cambiaron en `wrangler.jsonc`.
