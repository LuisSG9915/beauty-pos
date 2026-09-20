CREATE TABLE "comprobantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"cliente_id" uuid,
	"estado" varchar(20) DEFAULT 'borrador' NOT NULL,
	"receptor_rfc" varchar(13) NOT NULL,
	"receptor_nombre" varchar(254) NOT NULL,
	"receptor_regimen" varchar(3) NOT NULL,
	"receptor_cp" varchar(5) NOT NULL,
	"uso_cfdi" varchar(4) NOT NULL,
	"metodo_pago" varchar(3) DEFAULT 'PUE' NOT NULL,
	"forma_pago" varchar(2) NOT NULL,
	"serie" varchar(10),
	"folio" integer,
	"subtotal" numeric(12, 2) NOT NULL,
	"impuestos" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"moneda" varchar(3) DEFAULT 'MXN' NOT NULL,
	"uuid" varchar(36),
	"pac_proveedor" varchar(40),
	"pac_respuesta" jsonb,
	"error" text,
	"motivo_cancelacion" varchar(2),
	"uuid_sustitucion" varchar(36),
	"timbrado_at" timestamp with time zone,
	"cancelado_at" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "comprobantes_estado_chk" CHECK ("comprobantes"."estado" in ('borrador','timbrada','cancelada','error'))
);
--> statement-breakpoint
CREATE TABLE "facturacion_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"rfc" varchar(13),
	"razon_social" varchar(254),
	"regimen_fiscal" varchar(3),
	"codigo_postal" varchar(5),
	"serie" varchar(10) DEFAULT 'A',
	"folio_actual" integer DEFAULT 0 NOT NULL,
	"precios_incluyen_iva" boolean DEFAULT true NOT NULL,
	"tasa_iva" numeric(5, 4) DEFAULT '0.16' NOT NULL,
	"pac_proveedor" varchar(40) DEFAULT 'stub',
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "facturacion_config_organizacion_id_unique" UNIQUE("organizacion_id")
);
--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturacion_config" ADD CONSTRAINT "facturacion_config_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comprobantes_organizacion_idx" ON "comprobantes" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "comprobantes_venta_idx" ON "comprobantes" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "comprobantes_organizacion_estado_idx" ON "comprobantes" USING btree ("organizacion_id","estado");--> statement-breakpoint
CREATE INDEX "facturacion_config_organizacion_idx" ON "facturacion_config" USING btree ("organizacion_id");