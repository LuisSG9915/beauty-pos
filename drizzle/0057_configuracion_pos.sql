CREATE TABLE IF NOT EXISTS "configuracion_pos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizacion_id" uuid NOT NULL REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  "clave" varchar(60) NOT NULL,
  "valor" boolean NOT NULL DEFAULT true,
  "actualizada_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "configuracion_pos_organizacion_clave_uq" ON "configuracion_pos" ("organizacion_id", "clave");
CREATE INDEX IF NOT EXISTS "configuracion_pos_organizacion_idx" ON "configuracion_pos" ("organizacion_id");
