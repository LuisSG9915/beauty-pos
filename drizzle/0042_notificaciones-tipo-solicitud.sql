ALTER TABLE "notificaciones_envios" DROP CONSTRAINT "notificaciones_envios_tipo_chk";--> statement-breakpoint
ALTER TABLE "notificaciones_envios" ADD CONSTRAINT "notificaciones_envios_tipo_chk" CHECK ("notificaciones_envios"."tipo" in ('confirmacion','recordatorio','cambio','cancelacion','solicitud'));
