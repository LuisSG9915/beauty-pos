CREATE TABLE "bloqueos_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"usuario_id" uuid,
	"inicia_at" timestamp with time zone NOT NULL,
	"termina_at" timestamp with time zone NOT NULL,
	"tipo" varchar(30) DEFAULT 'personal' NOT NULL,
	"motivo" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "bloqueos_agenda_rango_chk" CHECK ("bloqueos_agenda"."inicia_at" < "bloqueos_agenda"."termina_at")
);
--> statement-breakpoint
CREATE TABLE "horarios_sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"dia_semana" integer NOT NULL,
	"inicia_minutos" integer NOT NULL,
	"termina_minutos" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "horarios_sucursales_dia_chk" CHECK ("horarios_sucursales"."dia_semana" between 0 and 6),
	CONSTRAINT "horarios_sucursales_rango_chk" CHECK ("horarios_sucursales"."inicia_minutos" >= 0 and "horarios_sucursales"."termina_minutos" <= 1440 and "horarios_sucursales"."inicia_minutos" < "horarios_sucursales"."termina_minutos")
);
--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_sucursales" ADD CONSTRAINT "horarios_sucursales_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios_sucursales" ADD CONSTRAINT "horarios_sucursales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueos_agenda_organizacion_idx" ON "bloqueos_agenda" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "bloqueos_agenda_sucursal_inicia_idx" ON "bloqueos_agenda" USING btree ("sucursal_id","inicia_at");--> statement-breakpoint
CREATE INDEX "bloqueos_agenda_usuario_idx" ON "bloqueos_agenda" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "horarios_sucursales_organizacion_idx" ON "horarios_sucursales" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "horarios_sucursales_sucursal_dia_idx" ON "horarios_sucursales" USING btree ("sucursal_id","dia_semana");--> statement-breakpoint
-- Compatibilidad: las sucursales activas existentes no tenían horarios configurados y la
-- agenda permitía agendar 08:00-21:00 todos los días; se preserva ese comportamiento.
INSERT INTO "horarios_sucursales" ("organizacion_id", "sucursal_id", "dia_semana", "inicia_minutos", "termina_minutos", "activo")
SELECT s."organizacion_id", s."id", d."dia", 480, 1260, true
FROM "sucursales" s
CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5), (6)) AS d("dia")
WHERE s."activo" = true;