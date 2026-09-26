---
trigger: model_decision
description: Cuando el usuario pida optimizar velocidad, reducir consultas, diagnosticar lentitud o trabajar rendimiento en general
---

# Rendimiento (activación por intención)

Melena corre sobre CockroachDB remoto + Cloudflare Workers: la latencia por
round-trip domina todo. Antes de optimizar:

1. Medir primero: `pnpm test:perf` (TTFB/LCP/CLS + navegación) y/o
   `DB_LOG_QUERIES=1` para contar rondas por request. No optimizar a ciegas.
2. Orden de ataque típico: reducir rondas secuenciales (fusión `jsonb`,
   `Promise.all`) → KV para datos fríos → índices parciales → `loading.tsx`/
   prefetch → Worker CPU/bundle.
3. Prohibido: caché de conexiones en globals, queries N+1 por fila, medir solo
   "a ojo" sin números antes/después.
4. Reportar siempre antes → después con los mismos comandos.
