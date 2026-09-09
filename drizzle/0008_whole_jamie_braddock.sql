CREATE TABLE "cat_medios_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(40) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"requiere_referencia" boolean DEFAULT false NOT NULL,
	"admite_cambio" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cat_medios_pago" ADD CONSTRAINT "cat_medios_pago_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_medios_pago_organizacion_clave_uq" ON "cat_medios_pago" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "cat_medios_pago_organizacion_idx" ON "cat_medios_pago" USING btree ("organizacion_id");