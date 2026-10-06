CREATE TABLE "medios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"entidad" varchar(20) NOT NULL,
	"entidad_id" uuid NOT NULL,
	"clave_r2" varchar(500) NOT NULL,
	"mime" varchar(80) NOT NULL,
	"bytes" integer NOT NULL,
	"ancho" integer,
	"alto" integer,
	"principal" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "medios_entidad_chk" CHECK ("medios"."entidad" in ('producto','servicio','ficha','compra'))
);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "imagen_principal_id" uuid;--> statement-breakpoint
ALTER TABLE "servicios" ADD COLUMN "imagen_principal_id" uuid;--> statement-breakpoint
ALTER TABLE "medios" ADD CONSTRAINT "medios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medios_clave_r2_uq" ON "medios" USING btree ("clave_r2");--> statement-breakpoint
CREATE INDEX "medios_organizacion_idx" ON "medios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "medios_entidad_idx" ON "medios" USING btree ("entidad","entidad_id");--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_imagen_principal_id_medios_id_fk" FOREIGN KEY ("imagen_principal_id") REFERENCES "public"."medios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_imagen_principal_id_medios_id_fk" FOREIGN KEY ("imagen_principal_id") REFERENCES "public"."medios"("id") ON DELETE no action ON UPDATE no action;