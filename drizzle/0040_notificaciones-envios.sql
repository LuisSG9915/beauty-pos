CREATE TABLE "notificaciones_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"correo_destino" varchar(254) NOT NULL,
	"fecha_hora_snapshot" timestamp with time zone NOT NULL,
	"version_cita" integer NOT NULL,
	"programado_para" timestamp with time zone NOT NULL,
	"estado" varchar(20) DEFAULT 'pendiente' NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"proximo_intento" timestamp with time zone,
	"lease_hasta" timestamp with time zone,
	"enviado_at" timestamp with time zone,
	"proveedor_id" varchar(160),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificaciones_envios_estado_chk" CHECK ("notificaciones_envios"."estado" in ('pendiente','enviando','enviado','fallido','omitido')),
	CONSTRAINT "notificaciones_envios_tipo_chk" CHECK ("notificaciones_envios"."tipo" in ('confirmacion','recordatorio','cambio','cancelacion'))
);
--> statement-breakpoint
ALTER TABLE "notificaciones_envios" ADD CONSTRAINT "notificaciones_envios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones_envios" ADD CONSTRAINT "notificaciones_envios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notificaciones_envios_cita_tipo_version_uq" ON "notificaciones_envios" USING btree ("cita_id","tipo","version_cita");--> statement-breakpoint
CREATE INDEX "notificaciones_envios_pendientes_idx" ON "notificaciones_envios" USING btree ("estado","programado_para");--> statement-breakpoint
CREATE INDEX "notificaciones_envios_organizacion_idx" ON "notificaciones_envios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "notificaciones_envios_cita_idx" ON "notificaciones_envios" USING btree ("cita_id");