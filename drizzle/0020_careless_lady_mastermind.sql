CREATE TABLE "claves_idempotencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(80) NOT NULL,
	"accion" varchar(60) NOT NULL,
	"resultado" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detalle_devoluciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"devolucion_id" uuid NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"detalle_id" uuid,
	"cantidad" numeric(12, 3) NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detalle_devoluciones_tipo_chk" CHECK ("detalle_devoluciones"."tipo" in ('servicio','producto'))
);
--> statement-breakpoint
CREATE TABLE "devoluciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "movimientos_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"corte_id" uuid NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"notas" text,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "movimientos_caja_tipo_chk" CHECK ("movimientos_caja"."tipo" in ('entrada','retiro','gasto','deposito','ajuste')),
	CONSTRAINT "movimientos_caja_monto_chk" CHECK ("movimientos_caja"."monto" <> 0)
);
--> statement-breakpoint
ALTER TABLE "detalle_ventas_medios_pagos" ADD COLUMN "recibido" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_ventas_medios_pagos" ADD COLUMN "cambio" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_ventas_productos" ADD COLUMN "nombre" varchar(160);--> statement-breakpoint
ALTER TABLE "detalle_ventas_servicios" ADD COLUMN "nombre" varchar(160);--> statement-breakpoint
ALTER TABLE "claves_idempotencia" ADD CONSTRAINT "claves_idempotencia_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_devoluciones" ADD CONSTRAINT "detalle_devoluciones_devolucion_id_devoluciones_id_fk" FOREIGN KEY ("devolucion_id") REFERENCES "public"."devoluciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_corte_id_cortes_caja_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claves_idempotencia_org_clave_uq" ON "claves_idempotencia" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "detalle_devoluciones_devolucion_idx" ON "detalle_devoluciones" USING btree ("devolucion_id");--> statement-breakpoint
CREATE INDEX "devoluciones_organizacion_idx" ON "devoluciones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "devoluciones_venta_idx" ON "devoluciones" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "devoluciones_sucursal_idx" ON "devoluciones" USING btree ("sucursal_id");--> statement-breakpoint
CREATE INDEX "movimientos_caja_organizacion_idx" ON "movimientos_caja" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "movimientos_caja_corte_idx" ON "movimientos_caja" USING btree ("corte_id");--> statement-breakpoint
CREATE INDEX "movimientos_caja_sucursal_idx" ON "movimientos_caja" USING btree ("sucursal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cortes_caja_abierto_sucursal_uq" ON "cortes_caja" USING btree ("sucursal_id") WHERE "cortes_caja"."estado" = 'abierto' and "cortes_caja"."activo";--> statement-breakpoint
-- Pagos históricos: lo recibido era igual al monto aplicado (sin cambio registrado).
UPDATE "detalle_ventas_medios_pagos" SET "recibido" = "monto" WHERE "recibido" = '0';--> statement-breakpoint
-- Snapshots de nombre en líneas históricas para tickets ya cobrados.
UPDATE "detalle_ventas_servicios" d SET "nombre" = s."nombre" FROM "servicios" s WHERE d."servicio_id" = s."id" AND d."nombre" IS NULL;--> statement-breakpoint
UPDATE "detalle_ventas_productos" d SET "nombre" = p."nombre" FROM "productos" p WHERE d."producto_id" = p."id" AND d."nombre" IS NULL;