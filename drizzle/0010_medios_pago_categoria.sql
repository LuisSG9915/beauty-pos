ALTER TABLE "cat_medios_pago" DROP COLUMN "requiere_referencia";--> statement-breakpoint
ALTER TABLE "cat_medios_pago" DROP COLUMN "admite_cambio";--> statement-breakpoint
ALTER TABLE "cat_medios_pago" ADD COLUMN "categoria" varchar(20) DEFAULT 'efectivo' NOT NULL;
