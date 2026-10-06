CREATE TABLE "uso_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"mes" date NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"conteo" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uso_ia_tipo_chk" CHECK ("uso_ia"."tipo" in ('producto','ticket','texto'))
);
--> statement-breakpoint
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uso_ia_org_mes_tipo_uq" ON "uso_ia" USING btree ("organizacion_id","mes","tipo");