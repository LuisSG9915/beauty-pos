CREATE TABLE "inventario_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"stock_actual" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"venta_id" uuid,
	"tipo" varchar(20) NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"stock_resultante" numeric(12, 3) NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "inventario_stock" ADD CONSTRAINT "inventario_stock_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_stock" ADD CONSTRAINT "inventario_stock_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_stock" ADD CONSTRAINT "inventario_stock_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventario_stock_sucursal_producto_uq" ON "inventario_stock" USING btree ("sucursal_id","producto_id");--> statement-breakpoint
CREATE INDEX "inventario_stock_organizacion_idx" ON "inventario_stock" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "inventario_stock_producto_idx" ON "inventario_stock" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "movimientos_inventario_organizacion_idx" ON "movimientos_inventario" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "movimientos_inventario_sucursal_producto_idx" ON "movimientos_inventario" USING btree ("sucursal_id","producto_id");--> statement-breakpoint
CREATE INDEX "movimientos_inventario_venta_idx" ON "movimientos_inventario" USING btree ("venta_id");