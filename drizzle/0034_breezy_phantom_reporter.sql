CREATE TABLE "cat_categorias_gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" varchar(40) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"categoria_id" uuid,
	"concepto" varchar(200) NOT NULL,
	"fecha_gasto" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"proveedor" varchar(160),
	"referencia" varchar(120),
	"notas" text,
	"movimiento_caja_id" uuid,
	"estado" varchar(20) DEFAULT 'confirmado' NOT NULL,
	"revertido_at" timestamp with time zone,
	"revertido_por" uuid,
	"motivo_reversion" text,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "gastos_estado_chk" CHECK ("gastos"."estado" in ('confirmado','revertido')),
	CONSTRAINT "gastos_importe_chk" CHECK ("gastos"."importe" > 0)
);
--> statement-breakpoint
ALTER TABLE "cat_categorias_gastos" ADD CONSTRAINT "cat_categorias_gastos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_categoria_id_cat_categorias_gastos_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."cat_categorias_gastos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_movimiento_caja_id_movimientos_caja_id_fk" FOREIGN KEY ("movimiento_caja_id") REFERENCES "public"."movimientos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_revertido_por_usuarios_id_fk" FOREIGN KEY ("revertido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_categorias_gastos_organizacion_clave_uq" ON "cat_categorias_gastos" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "cat_categorias_gastos_organizacion_idx" ON "cat_categorias_gastos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "gastos_organizacion_idx" ON "gastos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "gastos_sucursal_fecha_idx" ON "gastos" USING btree ("sucursal_id","fecha_gasto");--> statement-breakpoint
CREATE INDEX "gastos_categoria_idx" ON "gastos" USING btree ("categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_movimiento_caja_uq" ON "gastos" USING btree ("movimiento_caja_id") WHERE "gastos"."movimiento_caja_id" is not null;