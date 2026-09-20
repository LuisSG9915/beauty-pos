CREATE TABLE "billing_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid,
	"suscripcion_id" uuid,
	"tipo" varchar(60) NOT NULL,
	"external_id" varchar(160),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suscripcion_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"moneda" varchar(3) DEFAULT 'MXN' NOT NULL,
	"proveedor" varchar(30) DEFAULT 'manual' NOT NULL,
	"external_id" varchar(160),
	"referencia" varchar(160),
	"periodo_desde" date,
	"periodo_hasta" date,
	"estado" varchar(20) DEFAULT 'confirmado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "pagos_suscripcion_estado_chk" CHECK ("pagos_suscripcion"."estado" in ('pendiente','confirmado','rechazado')),
	CONSTRAINT "pagos_suscripcion_monto_chk" CHECK ("pagos_suscripcion"."monto" >= 0)
);
--> statement-breakpoint
CREATE TABLE "planes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" varchar(40) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"precio_mensual" numeric(12, 2) DEFAULT '0' NOT NULL,
	"moneda" varchar(3) DEFAULT 'MXN' NOT NULL,
	"trial_dias" integer DEFAULT 14 NOT NULL,
	"max_sucursales" integer,
	"max_usuarios" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "suscripciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"estado" varchar(20) DEFAULT 'trialing' NOT NULL,
	"trial_termina_at" timestamp with time zone,
	"periodo_inicia_at" timestamp with time zone,
	"periodo_termina_at" timestamp with time zone,
	"cancelada_at" timestamp with time zone,
	"motivo_cancelacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "suscripciones_estado_chk" CHECK ("suscripciones"."estado" in ('trialing','activa','past_due','cancelada','vencida'))
);
--> statement-breakpoint
ALTER TABLE "billing_eventos" ADD CONSTRAINT "billing_eventos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_eventos" ADD CONSTRAINT "billing_eventos_suscripcion_id_suscripciones_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_suscripcion_id_suscripciones_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_suscripcion" ADD CONSTRAINT "pagos_suscripcion_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones" ADD CONSTRAINT "suscripciones_plan_id_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_eventos_organizacion_idx" ON "billing_eventos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_eventos_external_uq" ON "billing_eventos" USING btree ("tipo","external_id") WHERE "billing_eventos"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "pagos_suscripcion_suscripcion_idx" ON "pagos_suscripcion" USING btree ("suscripcion_id");--> statement-breakpoint
CREATE INDEX "pagos_suscripcion_organizacion_idx" ON "pagos_suscripcion" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagos_suscripcion_external_uq" ON "pagos_suscripcion" USING btree ("proveedor","external_id") WHERE "pagos_suscripcion"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "planes_clave_uq" ON "planes" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "suscripciones_organizacion_idx" ON "suscripciones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripciones_vigente_uq" ON "suscripciones" USING btree ("organizacion_id") WHERE "suscripciones"."estado" in ('trialing','activa','past_due');