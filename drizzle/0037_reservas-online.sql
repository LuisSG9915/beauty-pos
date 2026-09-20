ALTER TABLE "sucursales" ADD COLUMN "reservas_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "reservas_auto_confirmar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "citas" ADD COLUMN "origen" varchar(20) DEFAULT 'panel' NOT NULL;