ALTER TABLE "ventas" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "ventas_sucursal_idempotency_uq" ON "ventas" ("sucursal_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "citas_sucursal_usuario_fecha_idx" ON "citas" ("sucursal_id", "usuario_id", "fecha_hora");
