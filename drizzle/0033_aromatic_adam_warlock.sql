CREATE TABLE "eventos_producto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid,
	"usuario_id" uuid,
	"nombre" varchar(80) NOT NULL,
	"atributos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progreso_guias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"guia_clave" varchar(60) NOT NULL,
	"guia_version" integer NOT NULL,
	"paso_actual" integer DEFAULT 0 NOT NULL,
	"estado" varchar(20) DEFAULT 'en_progreso' NOT NULL,
	"iniciada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_at" timestamp with time zone,
	CONSTRAINT "progreso_guias_estado_chk" CHECK ("progreso_guias"."estado" in ('en_progreso', 'completada', 'omitida')),
	CONSTRAINT "progreso_guias_paso_chk" CHECK ("progreso_guias"."paso_actual" >= 0)
);
--> statement-breakpoint
ALTER TABLE "eventos_producto" ADD CONSTRAINT "eventos_producto_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_producto" ADD CONSTRAINT "eventos_producto_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progreso_guias" ADD CONSTRAINT "progreso_guias_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progreso_guias" ADD CONSTRAINT "progreso_guias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_producto_organizacion_fecha_idx" ON "eventos_producto" USING btree ("organizacion_id","created_at");--> statement-breakpoint
CREATE INDEX "eventos_producto_nombre_idx" ON "eventos_producto" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "progreso_guias_usuario_uq" ON "progreso_guias" USING btree ("usuario_id","organizacion_id","guia_clave","guia_version");--> statement-breakpoint
CREATE INDEX "progreso_guias_organizacion_idx" ON "progreso_guias" USING btree ("organizacion_id");