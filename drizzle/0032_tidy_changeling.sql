CREATE TABLE "ajustes_pagos_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"venta_id" uuid NOT NULL,
	"detalle_venta_medio_pago_id" uuid NOT NULL,
	"medio_pago_origen_id" uuid NOT NULL,
	"medio_pago_destino_id" uuid NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"motivo" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"corte_origen_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "ajustes_pagos_venta_monto_chk" CHECK ("ajustes_pagos_venta"."monto" > 0)
);
--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_detalle_venta_medio_pago_id_detalle_ventas_medios_pagos_id_fk" FOREIGN KEY ("detalle_venta_medio_pago_id") REFERENCES "public"."detalle_ventas_medios_pagos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_medio_pago_origen_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_origen_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_medio_pago_destino_id_cat_medios_pago_id_fk" FOREIGN KEY ("medio_pago_destino_id") REFERENCES "public"."cat_medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_pagos_venta" ADD CONSTRAINT "ajustes_pagos_venta_corte_origen_id_cortes_caja_id_fk" FOREIGN KEY ("corte_origen_id") REFERENCES "public"."cortes_caja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_pagos_venta_organizacion_idx" ON "ajustes_pagos_venta" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "ajustes_pagos_venta_venta_idx" ON "ajustes_pagos_venta" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "ajustes_pagos_venta_pago_idx" ON "ajustes_pagos_venta" USING btree ("detalle_venta_medio_pago_id");