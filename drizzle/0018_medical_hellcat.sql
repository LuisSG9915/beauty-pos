CREATE TABLE "cortes_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"fondo_inicial" numeric(12, 2) DEFAULT '0' NOT NULL,
	"estado" varchar(20) DEFAULT 'abierto' NOT NULL,
	"cerrado_at" timestamp with time zone,
	"cerrado_por" uuid,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "cortes_caja_estado_chk" CHECK ("cortes_caja"."estado" in ('abierto','cerrado'))
);
--> statement-breakpoint
CREATE TABLE "detalle_cortes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corte_id" uuid NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"esperado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"contado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"diferencia" numeric(12, 2) DEFAULT '0' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "corte_id" uuid;--> statement-breakpoint
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cortes_caja" ADD CONSTRAINT "cortes_caja_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_cortes" ADD CONSTRAINT "detalle_cortes_corte_id_cortes_caja_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_cortes" ADD CONSTRAINT "detalle_cortes_medio_pago_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cortes_caja_organizacion_idx" ON "cortes_caja" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "cortes_caja_sucursal_estado_idx" ON "cortes_caja" USING btree ("sucursal_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "detalle_cortes_corte_medio_uq" ON "detalle_cortes" USING btree ("corte_id","medio_pago_id");--> statement-breakpoint
CREATE INDEX "detalle_cortes_corte_idx" ON "detalle_cortes" USING btree ("corte_id");--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_corte_id_cortes_caja_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."cortes_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_corte_idx" ON "ventas" USING btree ("corte_id");