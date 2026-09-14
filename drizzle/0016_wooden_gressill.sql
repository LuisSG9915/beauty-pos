CREATE TABLE "detalle_ventas_comisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"detalle_venta_servicio_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"comision_id" uuid,
	"tipo" varchar(20) NOT NULL,
	"valor" numeric(12, 3) NOT NULL,
	"base" numeric(12, 2) NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "detalle_ventas_propinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "detalle_ventas_servicios" ADD COLUMN "usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "propina" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD CONSTRAINT "detalle_ventas_comisiones_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD CONSTRAINT "detalle_ventas_comisiones_detalle_venta_servicio_id_detalle_ventas_servicios_id_fk" FOREIGN KEY ("detalle_venta_servicio_id") REFERENCES "public"."detalle_ventas_servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD CONSTRAINT "detalle_ventas_comisiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD CONSTRAINT "detalle_ventas_comisiones_comision_id_comisiones_id_fk" FOREIGN KEY ("comision_id") REFERENCES "public"."comisiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_propinas" ADD CONSTRAINT "detalle_ventas_propinas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_propinas" ADD CONSTRAINT "detalle_ventas_propinas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detalle_ventas_comisiones_venta_idx" ON "detalle_ventas_comisiones" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_comisiones_usuario_idx" ON "detalle_ventas_comisiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_comisiones_linea_idx" ON "detalle_ventas_comisiones" USING btree ("detalle_venta_servicio_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_propinas_venta_idx" ON "detalle_ventas_propinas" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_propinas_usuario_idx" ON "detalle_ventas_propinas" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "detalle_ventas_servicios" ADD CONSTRAINT "detalle_ventas_servicios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;