CREATE TABLE "incidentes_error" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"mensaje" text,
	"fuente" varchar(20) NOT NULL,
	"modulo" varchar(40),
	"ruta" varchar(160),
	"action_id" varchar(100),
	"prioridad" varchar(4) DEFAULT 'p3' NOT NULL,
	"estado" varchar(20) DEFAULT 'nuevo' NOT NULL,
	"ocurrencias" integer DEFAULT 1 NOT NULL,
	"organizaciones_afectadas" integer DEFAULT 0 NOT NULL,
	"primera_vez_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_vez_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sentry_issue_url" varchar(300),
	"release_aparece" varchar(60),
	"release_corregido" varchar(60),
	"asignado_a" uuid,
	"resuelto_at" timestamp with time zone,
	"resuelto_por" uuid,
	"nota_resolucion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidentes_historial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incidente_id" uuid NOT NULL,
	"usuario_id" uuid,
	"tipo" varchar(30) NOT NULL,
	"valor_anterior" varchar(120),
	"valor_nuevo" varchar(120),
	"comentario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidentes_ocurrencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incidente_id" uuid NOT NULL,
	"correlation_id" varchar(40) NOT NULL,
	"organizacion_id" uuid,
	"sucursal_id" uuid,
	"usuario_id" uuid,
	"ruta" varchar(160),
	"navegador" varchar(40),
	"dispositivo" varchar(20),
	"release" varchar(60),
	"contexto" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetria_producto_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sesion_id" uuid,
	"sid" varchar(40),
	"usuario_id" uuid,
	"organizacion_id" uuid,
	"sucursal_id" uuid,
	"tipo" varchar(30) NOT NULL,
	"ruta" varchar(160),
	"action_id" varchar(100),
	"accion_clave" boolean DEFAULT false NOT NULL,
	"metrica" varchar(20),
	"valor" numeric(12, 3),
	"metadata" jsonb,
	"client_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetria_sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sid" varchar(40) NOT NULL,
	"vid" varchar(40),
	"usuario_id" uuid,
	"organizacion_id" uuid,
	"sucursal_id" uuid,
	"rol" varchar(40),
	"entrada_ruta" varchar(160),
	"salida_ruta" varchar(160),
	"inicia_at" timestamp with time zone NOT NULL,
	"ultima_actividad_at" timestamp with time zone NOT NULL,
	"termina_at" timestamp with time zone,
	"paginas" integer DEFAULT 0 NOT NULL,
	"acciones" integer DEFAULT 0 NOT NULL,
	"tiempo_activo_ms" integer DEFAULT 0 NOT NULL,
	"engaged" boolean DEFAULT false NOT NULL,
	"dispositivo" varchar(20),
	"navegador" varchar(40),
	"release" varchar(60)
);
--> statement-breakpoint
ALTER TABLE "incidentes_error" ADD CONSTRAINT "incidentes_error_asignado_a_usuarios_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_error" ADD CONSTRAINT "incidentes_error_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_historial" ADD CONSTRAINT "incidentes_historial_incidente_id_incidentes_error_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes_error"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_historial" ADD CONSTRAINT "incidentes_historial_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_ocurrencias" ADD CONSTRAINT "incidentes_ocurrencias_incidente_id_incidentes_error_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes_error"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_ocurrencias" ADD CONSTRAINT "incidentes_ocurrencias_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_ocurrencias" ADD CONSTRAINT "incidentes_ocurrencias_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes_ocurrencias" ADD CONSTRAINT "incidentes_ocurrencias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetria_producto_eventos" ADD CONSTRAINT "telemetria_producto_eventos_sesion_id_telemetria_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."telemetria_sesiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incidentes_error_fingerprint_uq" ON "incidentes_error" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "incidentes_error_estado_idx" ON "incidentes_error" USING btree ("estado","prioridad");--> statement-breakpoint
CREATE INDEX "incidentes_error_fecha_idx" ON "incidentes_error" USING btree ("ultima_vez_at");--> statement-breakpoint
CREATE INDEX "incidentes_error_modulo_idx" ON "incidentes_error" USING btree ("modulo");--> statement-breakpoint
CREATE INDEX "incidentes_historial_incidente_idx" ON "incidentes_historial" USING btree ("incidente_id","created_at");--> statement-breakpoint
CREATE INDEX "incidentes_ocurrencias_incidente_idx" ON "incidentes_ocurrencias" USING btree ("incidente_id","created_at");--> statement-breakpoint
CREATE INDEX "incidentes_ocurrencias_corr_idx" ON "incidentes_ocurrencias" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "incidentes_ocurrencias_org_idx" ON "incidentes_ocurrencias" USING btree ("organizacion_id","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_fecha_idx" ON "telemetria_producto_eventos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_tipo_fecha_idx" ON "telemetria_producto_eventos" USING btree ("tipo","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_ruta_idx" ON "telemetria_producto_eventos" USING btree ("ruta","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_action_idx" ON "telemetria_producto_eventos" USING btree ("action_id","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_org_idx" ON "telemetria_producto_eventos" USING btree ("organizacion_id","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_prod_sesion_idx" ON "telemetria_producto_eventos" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "telemetria_sesiones_fecha_idx" ON "telemetria_sesiones" USING btree ("inicia_at");--> statement-breakpoint
CREATE INDEX "telemetria_sesiones_org_idx" ON "telemetria_sesiones" USING btree ("organizacion_id","inicia_at");--> statement-breakpoint
CREATE INDEX "telemetria_sesiones_entrada_idx" ON "telemetria_sesiones" USING btree ("entrada_ruta","inicia_at");