CREATE TABLE "cat_categorias_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "precios_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"vigencia_desde" date NOT NULL,
	"vigencia_hasta" date,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"categoria_id" uuid,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"descripcion" text,
	"duracion_minutos" integer DEFAULT 60 NOT NULL,
	"precio_base" numeric(12, 2) NOT NULL,
	"visible_agenda" boolean DEFAULT true NOT NULL,
	"requiere_cabina" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cat_categorias_servicios" ADD CONSTRAINT "cat_categorias_servicios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_servicios" ADD CONSTRAINT "precios_servicios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_servicios" ADD CONSTRAINT "precios_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios_servicios" ADD CONSTRAINT "precios_servicios_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_categoria_id_cat_categorias_servicios_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."cat_categorias_servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_categorias_servicios_organizacion_clave_uq" ON "cat_categorias_servicios" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "cat_categorias_servicios_organizacion_idx" ON "cat_categorias_servicios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "precios_servicios_servicio_sucursal_idx" ON "precios_servicios" USING btree ("servicio_id","sucursal_id");--> statement-breakpoint
CREATE INDEX "precios_servicios_vigencia_idx" ON "precios_servicios" USING btree ("vigencia_desde","vigencia_hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "servicios_organizacion_clave_uq" ON "servicios" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "servicios_organizacion_idx" ON "servicios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "servicios_categoria_idx" ON "servicios" USING btree ("categoria_id");