CREATE TABLE "detalle_ventas_productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "detalle_ventas_productos" ADD CONSTRAINT "detalle_ventas_productos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_productos" ADD CONSTRAINT "detalle_ventas_productos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detalle_ventas_productos_venta_idx" ON "detalle_ventas_productos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_productos_producto_idx" ON "detalle_ventas_productos" USING btree ("producto_id");