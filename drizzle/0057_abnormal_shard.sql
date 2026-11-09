CREATE TABLE "configuracion_pos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"valor" boolean DEFAULT true NOT NULL,
	"actualizada_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folios_venta" (
	"sucursal_id" uuid PRIMARY KEY NOT NULL,
	"ultimo" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "folio" integer;--> statement-breakpoint
ALTER TABLE "configuracion_pos" ADD CONSTRAINT "configuracion_pos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios_venta" ADD CONSTRAINT "folios_venta_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuracion_pos_organizacion_clave_uq" ON "configuracion_pos" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "configuracion_pos_organizacion_idx" ON "configuracion_pos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_sucursal_folio_uq" ON "ventas" USING btree ("sucursal_id","folio");--> statement-breakpoint
-- Backfill: numerar las ventas ya cobradas (completada/cancelada) por
-- sucursal en orden cronológico; las en_proceso quedan con folio NULL.
WITH ordenadas AS (
  SELECT id, sucursal_id,
         row_number() OVER (
           PARTITION BY sucursal_id
           ORDER BY coalesce(cobrada_at, created_at), id
         ) AS folio
  FROM ventas
  WHERE estado IN ('completada', 'cancelada')
)
UPDATE ventas v
SET folio = o.folio
FROM ordenadas o
WHERE v.id = o.id;
--> statement-breakpoint
INSERT INTO "folios_venta" ("sucursal_id", "ultimo")
SELECT sucursal_id, max(folio)
FROM ventas
WHERE folio IS NOT NULL
GROUP BY sucursal_id
ON CONFLICT (sucursal_id) DO NOTHING;
