CREATE TABLE "comisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"servicio_id" uuid,
	"rol_id" uuid,
	"tipo" varchar(20) DEFAULT 'porcentaje' NOT NULL,
	"valor" numeric(12, 3) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rel_servicios_insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "citas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cliente_id" uuid,
	"usuario_id" uuid,
	"fecha_hora" timestamp with time zone NOT NULL,
	"duracion_minutos" integer DEFAULT 60 NOT NULL,
	"estado" varchar(30) DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"total_estimado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "detalle_citas_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cita_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_rol_id_cat_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."cat_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_servicios_insumos" ADD CONSTRAINT "rel_servicios_insumos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_servicios_insumos" ADD CONSTRAINT "rel_servicios_insumos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_servicios_insumos" ADD CONSTRAINT "rel_servicios_insumos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citas" ADD CONSTRAINT "citas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_citas_servicios" ADD CONSTRAINT "detalle_citas_servicios_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_citas_servicios" ADD CONSTRAINT "detalle_citas_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comisiones_organizacion_idx" ON "comisiones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "comisiones_servicio_idx" ON "comisiones" USING btree ("servicio_id");--> statement-breakpoint
CREATE INDEX "comisiones_rol_idx" ON "comisiones" USING btree ("rol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rel_servicios_insumos_servicio_producto_uq" ON "rel_servicios_insumos" USING btree ("servicio_id","producto_id");--> statement-breakpoint
CREATE INDEX "rel_servicios_insumos_servicio_idx" ON "rel_servicios_insumos" USING btree ("servicio_id");--> statement-breakpoint
CREATE INDEX "rel_servicios_insumos_producto_idx" ON "rel_servicios_insumos" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "citas_organizacion_idx" ON "citas" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "citas_sucursal_fecha_idx" ON "citas" USING btree ("sucursal_id","fecha_hora");--> statement-breakpoint
CREATE INDEX "citas_cliente_idx" ON "citas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "citas_usuario_idx" ON "citas" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "citas_estado_idx" ON "citas" USING btree ("estado");--> statement-breakpoint
CREATE UNIQUE INDEX "detalle_citas_servicios_cita_servicio_uq" ON "detalle_citas_servicios" USING btree ("cita_id","servicio_id");--> statement-breakpoint
CREATE INDEX "detalle_citas_servicios_cita_idx" ON "detalle_citas_servicios" USING btree ("cita_id");