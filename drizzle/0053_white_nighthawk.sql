CREATE INDEX "gastos_medio_pago_idx" ON "gastos" USING btree ("medio_pago_id");--> statement-breakpoint
CREATE INDEX "gastos_usuario_idx" ON "gastos" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "claves_idempotencia_fecha_idx" ON "claves_idempotencia" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "detalle_ventas_medios_pagos_medio_idx" ON "detalle_ventas_medios_pagos" USING btree ("medio_pago_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_servicios_usuario_idx" ON "detalle_ventas_servicios" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "detalle_ventas_servicios_servicio_idx" ON "detalle_ventas_servicios" USING btree ("servicio_id");--> statement-breakpoint
CREATE INDEX "ventas_org_cliente_idx" ON "ventas" USING btree ("organizacion_id","cliente_id");--> statement-breakpoint
CREATE INDEX "ventas_org_usuario_idx" ON "ventas" USING btree ("organizacion_id","usuario_id");