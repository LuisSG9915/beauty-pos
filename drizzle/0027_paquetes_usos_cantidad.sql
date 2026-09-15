ALTER TABLE "detalle_devoluciones" DROP CONSTRAINT "detalle_devoluciones_tipo_chk";--> statement-breakpoint
ALTER TABLE "paquete_usos" ADD COLUMN "cantidad" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_devoluciones" ADD CONSTRAINT "detalle_devoluciones_tipo_chk" CHECK ("detalle_devoluciones"."tipo" in ('servicio','producto','paquete'));