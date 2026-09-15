ALTER TABLE "ventas" ADD COLUMN "promocion_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_promocion" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_promocion_id_promociones_id_fk" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id") ON DELETE no action ON UPDATE no action;