CREATE TABLE "miembros_organizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"estado" varchar(30) DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "organizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"zona_horaria" varchar(80) DEFAULT 'America/Mexico_City' NOT NULL,
	"moneda" varchar(3) DEFAULT 'MXN' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rel_usuarios_sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"sucursal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"clave" varchar(40) NOT NULL,
	"telefono" varchar(30),
	"correo" varchar(254),
	"direccion" text,
	"zona_horaria" varchar(80),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_usuario_id" text NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"correo" varchar(254) NOT NULL,
	"telefono" varchar(30),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "miembros_organizaciones" ADD CONSTRAINT "miembros_organizaciones_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembros_organizaciones" ADD CONSTRAINT "miembros_organizaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_usuarios_sucursales" ADD CONSTRAINT "rel_usuarios_sucursales_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_usuarios_sucursales" ADD CONSTRAINT "rel_usuarios_sucursales_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_usuarios_sucursales" ADD CONSTRAINT "rel_usuarios_sucursales_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "miembros_organizaciones_usuario_uq" ON "miembros_organizaciones" USING btree ("organizacion_id","usuario_id");--> statement-breakpoint
CREATE INDEX "miembros_organizaciones_usuario_idx" ON "miembros_organizaciones" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizaciones_slug_uq" ON "organizaciones" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "rel_usuarios_sucursales_uq" ON "rel_usuarios_sucursales" USING btree ("usuario_id","sucursal_id");--> statement-breakpoint
CREATE INDEX "rel_usuarios_sucursales_organizacion_idx" ON "rel_usuarios_sucursales" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sucursales_organizacion_clave_uq" ON "sucursales" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "sucursales_organizacion_idx" ON "sucursales" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_auth_usuario_uq" ON "usuarios" USING btree ("auth_usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_correo_uq" ON "usuarios" USING btree ("correo");