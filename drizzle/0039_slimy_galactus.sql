ALTER TABLE "pagos_suscripcion" ADD COLUMN "plan_clave" varchar(40);--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "periodicidad" varchar(20);--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "sucursales_facturadas" integer;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD COLUMN "precio_unitario" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "precio_anual" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "capacidades" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "recomendado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "planes" ADD COLUMN "orden" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "periodicidad" varchar(20) DEFAULT 'mensual' NOT NULL;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD COLUMN "sucursales_facturadas" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_periodicidad_chk" CHECK ("suscripciones"."periodicidad" in ('mensual','anual'));--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_sucursales_chk" CHECK ("suscripciones"."sucursales_facturadas" > 0);