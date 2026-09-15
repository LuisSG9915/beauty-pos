CREATE TABLE "citas_historial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cita_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid,
	"accion" varchar(40) NOT NULL,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "capacidad_sin_asignar" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "citas" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "citas_historial" ADD CONSTRAINT "citas_historial_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas_historial" ADD CONSTRAINT "citas_historial_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas_historial" ADD CONSTRAINT "citas_historial_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citas_historial_cita_idx" ON "citas_historial" USING btree ("cita_id");--> statement-breakpoint
CREATE INDEX "citas_historial_organizacion_idx" ON "citas_historial" USING btree ("organizacion_id");