CREATE TABLE "cat_categorias_productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "cat_unidades_medida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(20) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"categoria_id" uuid,
	"unidad_medida_id" uuid,
	"sku" varchar(80) NOT NULL,
	"codigo_barras" varchar(80),
	"nombre" varchar(160) NOT NULL,
	"descripcion" text,
	"tipo" varchar(20) DEFAULT 'producto' NOT NULL,
	"costo" numeric(12, 2) DEFAULT '0' NOT NULL,
	"precio_venta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"stock_minimo" numeric(12, 3) DEFAULT '0' NOT NULL,
	"visible_pos" boolean DEFAULT true NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "cat_categorias_productos" ADD CONSTRAINT "cat_categorias_productos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cat_unidades_medida" ADD CONSTRAINT "cat_unidades_medida_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_cat_categorias_productos_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."cat_categorias_productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_unidad_medida_id_cat_unidades_medida_id_fk" FOREIGN KEY ("unidad_medida_id") REFERENCES "public"."cat_unidades_medida"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_categorias_productos_organizacion_clave_uq" ON "cat_categorias_productos" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_unidades_medida_organizacion_clave_uq" ON "cat_unidades_medida" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_organizacion_sku_uq" ON "productos" USING btree ("organizacion_id","sku");--> statement-breakpoint
CREATE INDEX "productos_organizacion_idx" ON "productos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");