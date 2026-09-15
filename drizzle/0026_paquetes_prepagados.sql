CREATE TABLE "paquetes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"servicio_id" uuid NOT NULL,
	"sesiones" integer NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "paquetes_sesiones_chk" CHECK ("paquetes"."sesiones" > 0),
	CONSTRAINT "paquetes_precio_chk" CHECK ("paquetes"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cliente_paquetes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"paquete_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"sesiones_total" integer NOT NULL,
	"sesiones_restantes" integer NOT NULL,
	"estado" varchar(20) DEFAULT 'vigente' NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "cliente_paquetes_estado_chk" CHECK ("cliente_paquetes"."estado" in ('vigente','agotado','cancelado')),
	CONSTRAINT "cliente_paquetes_sesiones_chk" CHECK ("cliente_paquetes"."sesiones_total" > 0 and "cliente_paquetes"."sesiones_restantes" between 0 and "cliente_paquetes"."sesiones_total")
);
--> statement-breakpoint
CREATE TABLE "detalle_ventas_paquetes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"paquete_id" uuid NOT NULL,
	"nombre" varchar(160),
	"precio" numeric(12, 2) NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "paquete_usos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"cliente_paquete_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"detalle_venta_servicio_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_paquetes" ADD CONSTRAINT "cliente_paquetes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_paquetes" ADD CONSTRAINT "cliente_paquetes_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_paquetes" ADD CONSTRAINT "cliente_paquetes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_paquetes" ADD CONSTRAINT "cliente_paquetes_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_paquetes" ADD CONSTRAINT "cliente_paquetes_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_paquetes" ADD CONSTRAINT "detalle_ventas_paquetes_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_paquetes" ADD CONSTRAINT "detalle_ventas_paquetes_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_usos" ADD CONSTRAINT "paquete_usos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_usos" ADD CONSTRAINT "paquete_usos_cliente_paquete_id_cliente_paquetes_id_fk" FOREIGN KEY ("cliente_paquete_id") REFERENCES "public"."cliente_paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_usos" ADD CONSTRAINT "paquete_usos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_usos" ADD CONSTRAINT "paquete_usos_detalle_venta_servicio_id_detalle_ventas_servicios_id_fk" FOREIGN KEY ("detalle_venta_servicio_id") REFERENCES "public"."detalle_ventas_servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paquetes_organizacion_clave_uq" ON "paquetes" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "paquetes_organizacion_idx" ON "paquetes" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "paquetes_servicio_idx" ON "paquetes" USING btree ("servicio_id");--> statement-breakpoint
CREATE INDEX "cliente_paquetes_organizacion_idx" ON "cliente_paquetes" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "cliente_paquetes_cliente_estado_idx" ON "cliente_paquetes" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "cliente_paquetes_venta_idx" ON "cliente_paquetes" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "cliente_paquetes_paquete_idx" ON "cliente_paquetes" USING btree ("paquete_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_paquetes_venta_idx" ON "detalle_ventas_paquetes" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_paquetes_paquete_idx" ON "detalle_ventas_paquetes" USING btree ("paquete_id");--> statement-breakpoint
CREATE INDEX "paquete_usos_organizacion_idx" ON "paquete_usos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "paquete_usos_cliente_paquete_idx" ON "paquete_usos" USING btree ("cliente_paquete_id");--> statement-breakpoint
CREATE INDEX "paquete_usos_venta_idx" ON "paquete_usos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "paquete_usos_detalle_idx" ON "paquete_usos" USING btree ("detalle_venta_servicio_id");