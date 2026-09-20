ALTER TABLE "planes" ADD COLUMN "sucursales_incluidas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "precio_sucursal_extra" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "sucursales_incluidas" integer;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "precio_unitario" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "precio_sucursal_extra" numeric(12, 2);