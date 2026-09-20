CREATE TABLE "recordatorios_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"correo_destino" varchar(254) NOT NULL,
	"fecha_hora_snapshot" timestamp with time zone NOT NULL,
	"estado" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"enviado_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_envios_estado_chk" CHECK ("recordatorios_envios"."estado" in ('pendiente','enviado','fallido','omitido'))
);
--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "recordatorios_activos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "recordatorios_horas_antes" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "recordatorios_envios" ADD CONSTRAINT "recordatorios_envios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios_envios" ADD CONSTRAINT "recordatorios_envios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recordatorios_envios_cita_tipo_uq" ON "recordatorios_envios" USING btree ("cita_id","tipo");--> statement-breakpoint
CREATE INDEX "recordatorios_envios_organizacion_idx" ON "recordatorios_envios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "recordatorios_envios_estado_idx" ON "recordatorios_envios" USING btree ("estado");