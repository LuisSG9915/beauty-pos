ALTER TABLE "ventas" ADD COLUMN "cobrada_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ventas_sucursal_cobrada_idx" ON "ventas" USING btree ("sucursal_id","cobrada_at");