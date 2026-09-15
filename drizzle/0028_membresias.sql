CREATE TABLE "membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(60) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"precio" numeric(12, 2) NOT NULL,
	"duracion_dias" integer NOT NULL,
	"descuento_porcentaje" numeric(5, 2) DEFAULT '0' NOT NULL,
	"aplica" varchar(20) DEFAULT 'ambos' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "membresias_precio_chk" CHECK ("membresias"."precio" >= 0),
	CONSTRAINT "membresias_duracion_chk" CHECK ("membresias"."duracion_dias" > 0),
	CONSTRAINT "membresias_descuento_chk" CHECK ("membresias"."descuento_porcentaje" >= 0 and "membresias"."descuento_porcentaje" <= 100),
	CONSTRAINT "membresias_aplica_chk" CHECK ("membresias"."aplica" in ('ambos','servicio','producto'))
);
--> statement-breakpoint
CREATE TABLE "cliente_membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"membresia_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"vigencia_desde" date NOT NULL,
	"vigencia_hasta" date NOT NULL,
	"estado" varchar(20) DEFAULT 'vigente' NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "cliente_membresias_estado_chk" CHECK ("cliente_membresias"."estado" in ('vigente','vencida','cancelado')),
	CONSTRAINT "cliente_membresias_vigencia_chk" CHECK ("cliente_membresias"."vigencia_hasta" >= "cliente_membresias"."vigencia_desde")
);
--> statement-breakpoint
CREATE TABLE "detalle_ventas_membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"membresia_id" uuid NOT NULL,
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
ALTER TABLE "detalle_devoluciones" DROP CONSTRAINT "detalle_devoluciones_tipo_chk";--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "membresia_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_membresia" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_membresias" ADD CONSTRAINT "cliente_membresias_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_membresias" ADD CONSTRAINT "cliente_membresias_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_membresias" ADD CONSTRAINT "cliente_membresias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_membresias" ADD CONSTRAINT "cliente_membresias_membresia_id_membresias_id_fk" FOREIGN KEY ("membresia_id") REFERENCES "public"."membresias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_membresias" ADD CONSTRAINT "cliente_membresias_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_membresias" ADD CONSTRAINT "detalle_ventas_membresias_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_membresias" ADD CONSTRAINT "detalle_ventas_membresias_membresia_id_membresias_id_fk" FOREIGN KEY ("membresia_id") REFERENCES "public"."membresias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membresias_organizacion_clave_uq" ON "membresias" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "membresias_organizacion_idx" ON "membresias" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "cliente_membresias_organizacion_idx" ON "cliente_membresias" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "cliente_membresias_cliente_estado_idx" ON "cliente_membresias" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "cliente_membresias_venta_idx" ON "cliente_membresias" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_membresias_venta_idx" ON "detalle_ventas_membresias" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_membresias_membresia_idx" ON "detalle_ventas_membresias" USING btree ("membresia_id");--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_membresia_id_membresias_id_fk" FOREIGN KEY ("membresia_id") REFERENCES "public"."membresias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_devoluciones" ADD CONSTRAINT "detalle_devoluciones_tipo_chk" CHECK ("detalle_devoluciones"."tipo" in ('servicio','producto','paquete','membresia'));