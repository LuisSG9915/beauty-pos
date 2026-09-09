CREATE TABLE "cat_impuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(40) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"tasa" numeric(6, 4) NOT NULL,
	"tipo" varchar(20) DEFAULT 'agregado' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "promociones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"tipo" varchar(20) DEFAULT 'porcentaje' NOT NULL,
	"valor" numeric(12, 3) DEFAULT '0' NOT NULL,
	"aplica" varchar(20) DEFAULT 'ambos' NOT NULL,
	"vigencia_desde" date NOT NULL,
	"vigencia_hasta" date,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cat_impuestos" ADD CONSTRAINT "cat_impuestos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_impuestos_organizacion_clave_uq" ON "cat_impuestos" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "cat_impuestos_organizacion_idx" ON "cat_impuestos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promociones_organizacion_clave_uq" ON "promociones" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "promociones_organizacion_idx" ON "promociones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "promociones_vigencia_idx" ON "promociones" USING btree ("vigencia_desde","vigencia_hasta");