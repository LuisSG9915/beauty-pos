CREATE TABLE "cat_permisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" varchar(120) NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"modulo" varchar(80) NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cat_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid,
	"clave" varchar(80) NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"alcance" varchar(30) DEFAULT 'organizacion' NOT NULL,
	"es_sistema" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitaciones_usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"correo" varchar(254) NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"token_hash" text NOT NULL,
	"estado" varchar(30) DEFAULT 'pendiente' NOT NULL,
	"expira_at" timestamp with time zone NOT NULL,
	"aceptada_at" timestamp with time zone,
	"aceptada_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rel_miembros_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"miembro_organizacion_id" uuid NOT NULL,
	"rol_id" uuid NOT NULL,
	"prioridad" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rel_roles_permisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rol_id" uuid NOT NULL,
	"permiso_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cat_roles" ADD CONSTRAINT "cat_roles_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_usuarios" ADD CONSTRAINT "invitaciones_usuarios_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_usuarios" ADD CONSTRAINT "invitaciones_usuarios_aceptada_por_usuarios_id_fk" FOREIGN KEY ("aceptada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_usuarios" ADD CONSTRAINT "invitaciones_usuarios_created_by_usuarios_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_miembros_roles" ADD CONSTRAINT "rel_miembros_roles_miembro_organizacion_id_miembros_organizaciones_id_fk" FOREIGN KEY ("miembro_organizacion_id") REFERENCES "public"."miembros_organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_miembros_roles" ADD CONSTRAINT "rel_miembros_roles_rol_id_cat_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."cat_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_roles_permisos" ADD CONSTRAINT "rel_roles_permisos_rol_id_cat_roles_id_fk" FOREIGN KEY ("rol_id") REFERENCES "public"."cat_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rel_roles_permisos" ADD CONSTRAINT "rel_roles_permisos_permiso_id_cat_permisos_id_fk" FOREIGN KEY ("permiso_id") REFERENCES "public"."cat_permisos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cat_permisos_clave_uq" ON "cat_permisos" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "cat_permisos_modulo_idx" ON "cat_permisos" USING btree ("modulo");--> statement-breakpoint
CREATE UNIQUE INDEX "cat_roles_organizacion_clave_uq" ON "cat_roles" USING btree ("organizacion_id","clave");--> statement-breakpoint
CREATE INDEX "cat_roles_organizacion_idx" ON "cat_roles" USING btree ("organizacion_id");--> statement-breakpoint
CREATE INDEX "invitaciones_usuarios_organizacion_idx" ON "invitaciones_usuarios" USING btree ("organizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitaciones_usuarios_token_hash_uq" ON "invitaciones_usuarios" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "rel_miembros_roles_uq" ON "rel_miembros_roles" USING btree ("miembro_organizacion_id","rol_id");--> statement-breakpoint
CREATE INDEX "rel_miembros_roles_rol_idx" ON "rel_miembros_roles" USING btree ("rol_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rel_roles_permisos_uq" ON "rel_roles_permisos" USING btree ("rol_id","permiso_id");