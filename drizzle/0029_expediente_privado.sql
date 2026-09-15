CREATE TABLE "clientes_consentimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cita_id" uuid,
	"servicio_id" uuid,
	"usuario_id" uuid,
	"titulo" varchar(160) NOT NULL,
	"contenido" text NOT NULL,
	"firmado_por" varchar(160) NOT NULL,
	"respuesta" varchar(20) DEFAULT 'aceptado' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "clientes_consentimientos_respuesta_chk" CHECK ("clientes_consentimientos"."respuesta" in ('aceptado','rechazado'))
);
--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD COLUMN "privada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes_consentimientos" ADD CONSTRAINT "clientes_consentimientos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_consentimientos" ADD CONSTRAINT "clientes_consentimientos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_consentimientos" ADD CONSTRAINT "clientes_consentimientos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_consentimientos" ADD CONSTRAINT "clientes_consentimientos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_consentimientos" ADD CONSTRAINT "clientes_consentimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_consentimientos_organizacion_idx" ON "clientes_consentimientos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "clientes_consentimientos_cliente_idx" ON "clientes_consentimientos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "clientes_consentimientos_cita_idx" ON "clientes_consentimientos" USING btree ("cita_id");