CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"apellido_paterno" varchar(100),
	"apellido_materno" varchar(100),
	"telefono" varchar(30),
	"telefono_normalizado" varchar(30),
	"correo" varchar(254),
	"correo_normalizado" varchar(254),
	"fecha_nacimiento" date,
	"notas_operativas" text,
	"rfc" varchar(13),
	"razon_social" varchar(254),
	"codigo_postal_fiscal" varchar(5),
	"regimen_fiscal" varchar(3),
	"uso_cfdi" varchar(4),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_organizacion_idx" ON "clientes" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "clientes_organizacion_nombre_idx" ON "clientes" USING btree ("organizacion_id","nombre");--> statement-breakpoint
CREATE INDEX "clientes_organizacion_telefono_idx" ON "clientes" USING btree ("organizacion_id","telefono_normalizado");--> statement-breakpoint
CREATE INDEX "clientes_organizacion_correo_idx" ON "clientes" USING btree ("organizacion_id","correo_normalizado");