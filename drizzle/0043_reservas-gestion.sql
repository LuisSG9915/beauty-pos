CREATE TABLE "rate_limit_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" varchar(40) NOT NULL,
	"clave" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas_gestion_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"ultimo_uso_at" timestamp with time zone,
	"revocado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificaciones_envios" DROP CONSTRAINT "notificaciones_envios_tipo_chk";--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "reservas_cancelacion_horas" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "reservas_anticipacion_minutos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sucursales" ADD COLUMN "reservas_horizonte_dias" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservas_gestion_tokens" ADD CONSTRAINT "reservas_gestion_tokens_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_gestion_tokens" ADD CONSTRAINT "reservas_gestion_tokens_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limit_eventos_bucket_clave_idx" ON "rate_limit_eventos" USING btree ("bucket","clave","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_gestion_tokens_cita_uq" ON "reservas_gestion_tokens" USING btree ("cita_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_gestion_tokens_hash_uq" ON "reservas_gestion_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reservas_gestion_tokens_organizacion_idx" ON "reservas_gestion_tokens" USING btree ("organizacion_id");--> statement-breakpoint
ALTER TABLE "notificaciones_envios" ADD CONSTRAINT "notificaciones_envios_tipo_chk" CHECK ("notificaciones_envios"."tipo" in ('confirmacion','recordatorio','cambio','cancelacion','solicitud'));