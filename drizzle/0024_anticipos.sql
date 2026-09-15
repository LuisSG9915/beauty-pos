CREATE TABLE "anticipos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"cliente_id" uuid,
	"venta_id" uuid,
	"monto" numeric(12, 2) NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"referencia" varchar(120),
	"corte_id" uuid,
	"estado" varchar(20) DEFAULT 'vigente' NOT NULL,
	"notas" text,
	"usuario_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "anticipos_estado_chk" CHECK ("anticipos"."estado" in ('vigente','aplicado','devuelto')),
	CONSTRAINT "anticipos_monto_chk" CHECK ("anticipos"."monto" > 0)
);
--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_cita_id_citas_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."citas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_corte_id_cortes_caja_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticipos" ADD CONSTRAINT "anticipos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anticipos_organizacion_idx" ON "anticipos" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "anticipos_cita_idx" ON "anticipos" USING btree ("cita_id");--> statement-breakpoint
CREATE INDEX "anticipos_venta_idx" ON "anticipos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "anticipos_sucursal_estado_idx" ON "anticipos" USING btree ("sucursal_id","estado");