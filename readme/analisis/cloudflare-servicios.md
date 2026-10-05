# Análisis: qué otros servicios de Cloudflare usar

Ya usas: Workers (OpenNext), Hyperdrive, KV (`CACHE_KV`), dominio propio, source
maps y observabilidad. Esto es lo que conviene agregar, en orden de valor.

## Ahora (con las fases del plan)

| Servicio | Uso | Plan | Costo aprox. |
|---|---|---|---|
| **R2** | Bucket `melena-media` para fotos de productos/servicios, tickets de compra, mobiliario y fichas antes/después. Sin costo de egreso | 07, 08, 10, 11 | ~$0.015/GB-mes almacenado; operaciones clase A/B por millón |
| **Workers AI** | Visión: `@cf/meta/llama-4-scout-17b-16e-instruct` para foto de producto (08) y ticket de compra (10). Texto: `@cf/meta/llama-3.1-8b-instruct-fp8` para el resumen de compras (12) | 08, 10, 12 | Llama 4 Scout: $0.27/M tokens entrada, $0.85/M salida (doc ago-2026) → ≈ $0.001 por foto; tier gratis diario incluido |
| **AI Gateway** | Gateway `melena-ia`: rate limiting, logs y analytics de costo de las llamadas | 08, 10, 12 | Incluido; se paga el modelo |

Volumen esperado: con los límites de `LIMITE_IA_MENSUAL` (30 / 300 / 1000 capturas
por mes según plan) el costo de IA por negocio queda en centavos de dólar al mes.

## Descartados en esta etapa (y por qué)

| Servicio | Motivo |
|---|---|
| **Queues / Workflows** | Agregar un consumidor exige un worker propio junto al de OpenNext. Esperar a Workers AI es I/O (no consume CPU del Worker), así que el ticket se analiza en la misma petición con reintento manual |
| **Cron Triggers** | La alerta "por agotarse" se calcula al leer el tablero (`cargarAlertas`). Los avisos de cita ya usan un scheduler externo contra `/api/cron/recordatorios` |
| **Images (de pago)** | Se comprime en el cliente (WebP ≤ 1600 px) y se sirve con caché inmutable; Images solo si las miniaturas pesan en `test:perf` |

## Después

| Servicio | Uso | Cuándo |
|---|---|---|
| **Turnstile** | Anti-bot invisible en `/reservar` y `/registro` (páginas públicas) | Cuando haya tráfico público real |
| **Durable Objects** | Presencia/bloqueo en vivo de la agenda entre varias recepcionistas | Solo si hay multi-recepcionista simultáneo |
| **Email Routing** | Buzones `soporte@melena.app`/`avisos@` sin servidor de correo | Opcional |
| **Workers Analytics Engine** | Métricas de alta cardinalidad si `telemetria_*` crece mucho | Solo si el panel de telemetría se satura |

## No conviene

- **D1** como base principal (ver `d1-vs-cockroach.md`).
- **Pages**: ya estás en Workers con OpenNext.
- **Vectorize**: solo si se hace búsqueda semántica de productos; es prematuro.

## Notas de implementación

- Declarar bindings nuevos en `wrangler.jsonc` (`r2_buckets`, `ai`, `vars.AI_GATEWAY_ID`)
  y regenerar `worker-configuration.d.ts` con `pnpm cf:typegen`.
- Acceso a bindings con el patrón de `src/lib/kv-cache.ts`
  (`getCloudflareContext({ async: false })`, `null` fuera de Workers → degradar).
- Pasos manuales del dueño: crear bucket `melena-media` (plan 07) y gateway
  `melena-ia` (plan 08) en el dashboard.
