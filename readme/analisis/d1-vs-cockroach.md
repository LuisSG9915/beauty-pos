# Análisis: migrar CockroachDB (Postgres) → Cloudflare D1

Conclusión: **no migrar ahora**. Reevaluar solo si el costo de CockroachDB se vuelve
un problema real.

## Contexto actual

- CockroachDB Serverless en AWS `us-east-2`, accedido vía binding **Hyperdrive**
  (`wrangler.jsonc`), con fallback a `DATABASE_URL` en desarrollo local.
- `placement.region = "aws:us-east-2"` ya coloca el Worker junto a la BD:
  ~3 ms por consulta en lugar de ~80–100 ms por round-trip al edge.
- Drizzle ORM con esquema en `src/db/schema/` (~2 300 líneas, 9 archivos) y
  50 migraciones en `drizzle/`.

## Qué costaría migrar

1. **Dependencia real de Postgres.** ~140 puntos del código usan piezas que no
   existen en SQLite/D1: `jsonb` (subselects `jsonb_build_object` que fusionan
   contexto admin y agenda en una sola query), casts `::numeric`, `for update`,
   transacciones con nivel de aislamiento, `at time zone`, `generate_series`.
2. **La optimización principal se rompe.** La regla de arquitectura manda fusionar
   consultas con subselects `jsonb` porque las conexiones en paralelo cuestan
   ~60 ms de handshake. D1 no tiene handshake de socket, pero tampoco tiene
   `jsonb_build_object`; habría que reescribir esas consultas a múltiples queries
   y reensamblar en el Worker.
3. **Reescritura total del esquema.** `pgTable` → `sqliteTable`, `numeric` → texto
   o entero con escala fija, `uuid`, `timestamptz`, `jsonb`, enums por check… y
   regenerar las 50 migraciones o migrar datos con un script de export/import.
4. **D1 es single-threaded por base** y con tope **duro de 10 GB** (no ampliable).
   CockroachDB no tiene esos topes. Un POS multi-sucursal creciendo cabe hoy, pero
   el tope existe y no se puede mover.
5. **Riesgo en lo crítico.** Cobro, caja y concurrencia de agenda son lo que menos
   se quiere tocar. Una migración de motor es el cambio más riesgoso posible para
   el beneficio más pequeño posible.

## Costo (precios Cloudflare, abr-2026)

| Concepto | Workers Free | Workers Paid ($5/mes) |
|---|---|---|
| Filas leídas | 5 M/día | 25 mil M/mes incluidas, luego $0.001 por millón |
| Filas escritas | 100 k/día | 50 M/mes incluidas, luego $1.00 por millón |
| Almacenamiento | 5 GB total | 5 GB incluidos, luego $0.75/GB-mes |

Para un salón (miles de ventas/mes) D1 saldría **prácticamente $0 extra** sobre el
plan de Workers que ya se paga. El ahorro real = lo que cueste CockroachDB hoy
(Serverless puede ser ~$0 en el tier gratis o bajo consumo). **Ahorro pequeño y
acotado; costo de migración grande y con riesgo.** La cuenta no sale.

## Qué sí recomendamos

- Quédate en Postgres. Si CockroachDB sube de precio, mueve el `DATABASE_URL` a
  Neon/Supabase/RDS y actualiza el binding Hyperdrive: **cero cambios de código**.
- Cachea más con `kvReadThrough` (ya existe `CACHE_KV`) para reducir round-trips
  y costo de consultas.
- Si algún día el volumen lo justifica, D1 encaja como **segunda base** para datos
  fríos/telemetría, no como reemplazo de la transaccional.

## Si en el futuro sí se migra (checklist)

1. Export de CockroachDB (pg_dump) y script de conversión de tipos.
2. Nuevo esquema `sqliteTable` en Drizzle + migración de datos por lotes
   (D1: máx. 100 parámetros por query; batch de ~1 000 filas).
3. Reescribir consultas `jsonb`/transaccionales; doble suite de tests.
4. Flag de rollout y plan de rollback antes de tocar producción.
