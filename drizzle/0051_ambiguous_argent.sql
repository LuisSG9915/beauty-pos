CREATE TABLE "compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"proveedor_id" uuid,
	"proveedor_texto" varchar(160),
	"folio" varchar(80),
	"fecha_compra" date,
	"estado" varchar(20) DEFAULT 'borrador' NOT NULL,
	"total_ticket" numeric(12, 2),
	"total_calculado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"medio_ticket_id" uuid,
	"analisis_ia" jsonb,
	"analisis_error" text,
	"observaciones" text,
	"actualizar_costos" boolean DEFAULT true NOT NULL,
	"recibida_por" uuid,
	"recibida_at" timestamp with time zone,
	"resuelta_por" uuid,
	"resuelta_at" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "compras_estado_chk" CHECK ("compras"."estado" in ('borrador','por_verificar','verificada','con_observacion','cancelada'))
);
--> statement-breakpoint
CREATE TABLE "detalle_compras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" varchar(240) NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"cantidad_recibida" numeric(12, 3),
	"costo_unitario" numeric(12, 2) NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"observacion" text,
	"origen" varchar(10) DEFAULT 'manual' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "detalle_compras_origen_chk" CHECK ("detalle_compras"."origen" in ('ia','manual'))
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"telefono" varchar(40),
	"correo" varchar(160),
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD COLUMN "compra_id" uuid;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_medio_ticket_id_medios_id_fk" FOREIGN KEY ("medio_ticket_id") REFERENCES "public"."medios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_recibida_por_usuarios_id_fk" FOREIGN KEY ("recibida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_resuelta_por_usuarios_id_fk" FOREIGN KEY ("resuelta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_compras" ADD CONSTRAINT "detalle_compras_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_org_idx" ON "compras" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "compras_sucursal_estado_idx" ON "compras" USING btree ("sucursal_id","estado");--> statement-breakpoint
CREATE INDEX "detalle_compras_compra_idx" ON "detalle_compras" USING btree ("compra_id");--> statement-breakpoint
CREATE INDEX "detalle_compras_producto_idx" ON "detalle_compras" USING btree ("producto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proveedores_org_nombre_uq" ON "proveedores" USING btree ("organizacion_id","nombre");--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_inventario_compra_idx" ON "movimientos_inventario" USING btree ("compra_id");