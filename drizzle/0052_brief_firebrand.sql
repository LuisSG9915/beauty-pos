CREATE TABLE "inventario_ubicaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"ubicacion_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "inventario_ubicaciones_cantidad_chk" CHECK ("inventario_ubicaciones"."cantidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mobiliario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"piso_id" uuid,
	"tipo" varchar(20) DEFAULT 'otro' NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"estado" varchar(20) DEFAULT 'bueno' NOT NULL,
	"recurso_id" uuid,
	"foto_id" uuid,
	"fecha_adquisicion" date,
	"costo" numeric(12, 2),
	"notas" text,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"ancho" integer DEFAULT 2 NOT NULL,
	"alto" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "mobiliario_tipo_chk" CHECK ("mobiliario"."tipo" in ('asiento','mesa','tocador','lavacabezas','camilla','carrito','espejo','otro')),
	CONSTRAINT "mobiliario_estado_chk" CHECK ("mobiliario"."estado" in ('bueno','mantenimiento','baja')),
	CONSTRAINT "mobiliario_pos_chk" CHECK ("mobiliario"."x" >= 0 and "mobiliario"."y" >= 0 and "mobiliario"."ancho" between 1 and 20 and "mobiliario"."alto" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "pisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"columnas" integer DEFAULT 24 NOT NULL,
	"filas" integer DEFAULT 16 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "pisos_tamano_chk" CHECK ("pisos"."columnas" between 8 and 60 and "pisos"."filas" between 8 and 40)
);
--> statement-breakpoint
CREATE TABLE "ubicaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"piso_id" uuid NOT NULL,
	"tipo" varchar(20) DEFAULT 'estante' NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"ancho" integer DEFAULT 2 NOT NULL,
	"alto" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ubicaciones_tipo_chk" CHECK ("ubicaciones"."tipo" in ('vitrina','estante','bodega','mostrador','otro')),
	CONSTRAINT "ubicaciones_pos_chk" CHECK ("ubicaciones"."x" >= 0 and "ubicaciones"."y" >= 0 and "ubicaciones"."ancho" between 1 and 20 and "ubicaciones"."alto" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "medios" DROP CONSTRAINT "medios_entidad_chk";--> statement-breakpoint
ALTER TABLE "inventario_ubicaciones" ADD CONSTRAINT "inventario_ubicaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_ubicaciones" ADD CONSTRAINT "inventario_ubicaciones_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_ubicaciones" ADD CONSTRAINT "inventario_ubicaciones_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobiliario" ADD CONSTRAINT "mobiliario_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobiliario" ADD CONSTRAINT "mobiliario_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobiliario" ADD CONSTRAINT "mobiliario_piso_id_pisos_id_fk" FOREIGN KEY ("piso_id") REFERENCES "public"."pisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobiliario" ADD CONSTRAINT "mobiliario_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobiliario" ADD CONSTRAINT "mobiliario_foto_id_medios_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."medios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pisos" ADD CONSTRAINT "pisos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pisos" ADD CONSTRAINT "pisos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ubicaciones" ADD CONSTRAINT "ubicaciones_piso_id_pisos_id_fk" FOREIGN KEY ("piso_id") REFERENCES "public"."pisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventario_ubicaciones_ubic_prod_uq" ON "inventario_ubicaciones" USING btree ("ubicacion_id","producto_id");--> statement-breakpoint
CREATE INDEX "inventario_ubicaciones_producto_idx" ON "inventario_ubicaciones" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "inventario_ubicaciones_organizacion_idx" ON "inventario_ubicaciones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "mobiliario_sucursal_idx" ON "mobiliario" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "mobiliario_piso_idx" ON "mobiliario" USING btree ("piso_id");--> statement-breakpoint
CREATE INDEX "mobiliario_organizacion_idx" ON "mobiliario" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "pisos_sucursal_idx" ON "pisos" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "pisos_organizacion_idx" ON "pisos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "ubicaciones_piso_idx" ON "ubicaciones" USING btree ("piso_id");--> statement-breakpoint
CREATE INDEX "ubicaciones_sucursal_idx" ON "ubicaciones" USING btree ("sucursal_id");--> statement-breakpoint
ALTER TABLE "medios" ADD CONSTRAINT "medios_entidad_chk" CHECK ("medios"."entidad" in ('producto','servicio','ficha','compra','mobiliario'));