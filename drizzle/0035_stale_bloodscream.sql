CREATE TABLE "liquidaciones_comisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"periodo_desde" date NOT NULL,
	"periodo_hasta" date NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"movimiento_caja_id" uuid,
	"notas" text,
	"estado" varchar(20) DEFAULT 'confirmada' NOT NULL,
	"revertida_at" timestamp with time zone,
	"revertida_por" uuid,
	"motivo_reversion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "liquidaciones_comisiones_estado_chk" CHECK ("liquidaciones_comisiones"."estado" in ('confirmada','revertida')),
	CONSTRAINT "liquidaciones_comisiones_total_chk" CHECK ("liquidaciones_comisiones"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD COLUMN "liquidacion_id" uuid;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_movimiento_caja_id_movimientos_caja_id_fk" FOREIGN KEY ("movimiento_caja_id") REFERENCES "public"."movimientos_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidaciones_comisiones" ADD CONSTRAINT "liquidaciones_comisiones_revertida_por_usuarios_id_fk" FOREIGN KEY ("revertida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "liquidaciones_comisiones_organizacion_idx" ON "liquidaciones_comisiones" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "liquidaciones_comisiones_sucursal_idx" ON "liquidaciones_comisiones" USING btree ("sucursal_id","periodo_hasta");--> statement-breakpoint
CREATE INDEX "liquidaciones_comisiones_usuario_idx" ON "liquidaciones_comisiones" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "detalle_ventas_comisiones" ADD CONSTRAINT "detalle_ventas_comisiones_liquidacion_id_liquidaciones_comisiones_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidaciones_comisiones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detalle_ventas_comisiones_liquidacion_idx" ON "detalle_ventas_comisiones" USING btree ("liquidacion_id");