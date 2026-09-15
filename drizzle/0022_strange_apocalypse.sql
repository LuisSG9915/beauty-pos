CREATE TABLE "cita_recursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cita_id" uuid NOT NULL,
	"recurso_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "recursos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"tipo" varchar(30) DEFAULT 'equipo' NOT NULL,
	"capacidad" integer DEFAULT 1 NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "recursos_tipo_chk" CHECK ("recursos"."tipo" in ('cabina','silla','equipo','otro')),
	CONSTRAINT "recursos_capacidad_chk" CHECK ("recursos"."capacidad" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "cita_recursos" ADD CONSTRAINT "cita_recursos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita_recursos" ADD CONSTRAINT "cita_recursos_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita_recursos" ADD CONSTRAINT "cita_recursos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cita_recursos_cita_recurso_uq" ON "cita_recursos" USING btree ("cita_id","recurso_id");--> statement-breakpoint
CREATE INDEX "cita_recursos_cita_idx" ON "cita_recursos" USING btree ("cita_id");--> statement-breakpoint
CREATE INDEX "cita_recursos_recurso_idx" ON "cita_recursos" USING btree ("recurso_id");--> statement-breakpoint
CREATE INDEX "recursos_organizacion_idx" ON "recursos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "recursos_sucursal_idx" ON "recursos" USING btree ("sucursal_id");