CREATE TABLE "clientes_fichas_tecnicas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cita_id" uuid,
	"servicio_id" uuid,
	"usuario_id" uuid,
	"tipo" varchar(20) NOT NULL,
	"formula" text,
	"tiempo_pose_minutos" integer,
	"notas" text,
	"fotos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "clientes_fichas_tipo_chk" CHECK ("clientes_fichas_tecnicas"."tipo" in ('color','tratamiento','alergia','nota'))
);
--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD CONSTRAINT "clientes_fichas_tecnicas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD CONSTRAINT "clientes_fichas_tecnicas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD CONSTRAINT "clientes_fichas_tecnicas_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD CONSTRAINT "clientes_fichas_tecnicas_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_fichas_tecnicas" ADD CONSTRAINT "clientes_fichas_tecnicas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_fichas_organizacion_idx" ON "clientes_fichas_tecnicas" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "clientes_fichas_cliente_idx" ON "clientes_fichas_tecnicas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "clientes_fichas_cita_idx" ON "clientes_fichas_tecnicas" USING btree ("cita_id");