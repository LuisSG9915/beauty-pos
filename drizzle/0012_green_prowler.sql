CREATE TABLE "detalle_ventas_medios_pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"referencia" varchar(120),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "detalle_ventas_servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"cantidad" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cita_id" uuid,
	"cliente_id" uuid,
	"usuario_id" uuid,
	"estado" varchar(30) DEFAULT 'en_proceso' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"descuento" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "detalle_ventas_medios_pagos" ADD CONSTRAINT "detalle_ventas_medios_pagos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_medios_pagos" ADD CONSTRAINT "detalle_ventas_medios_pagos_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_servicios" ADD CONSTRAINT "detalle_ventas_servicios_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_ventas_servicios" ADD CONSTRAINT "detalle_ventas_servicios_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detalle_ventas_medios_pagos_venta_idx" ON "detalle_ventas_medios_pagos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_servicios_venta_idx" ON "detalle_ventas_servicios" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "ventas_organizacion_idx" ON "ventas" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "ventas_sucursal_idx" ON "ventas" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "ventas_cita_idx" ON "ventas" USING btree ("cita_id");--> statement-breakpoint
CREATE INDEX "ventas_estado_idx" ON "ventas" USING btree ("estado");