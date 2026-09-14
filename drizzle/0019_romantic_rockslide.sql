CREATE TABLE "auditoria_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"sucursal_id" uuid,
	"usuario_id" uuid,
	"accion" varchar(80) NOT NULL,
	"entidad" varchar(60),
	"entidad_id" uuid,
	"detalle" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_eventos_org_fecha_idx" ON "auditoria_eventos" USING btree ("organizacion_id","created_at");--> statement-breakpoint
CREATE INDEX "auditoria_eventos_entidad_idx" ON "auditoria_eventos" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_eventos_usuario_idx" ON "auditoria_eventos" USING btree ("usuario_id");