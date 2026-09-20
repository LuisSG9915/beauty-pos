CREATE TABLE "telemetria_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vid" varchar(40),
	"tipo" varchar(30) NOT NULL,
	"origen" varchar(40) NOT NULL,
	"referer" varchar(500),
	"utm" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telemetria_eventos_tipo_fecha_idx" ON "telemetria_eventos" USING btree ("tipo","created_at");--> statement-breakpoint
CREATE INDEX "telemetria_eventos_vid_idx" ON "telemetria_eventos" USING btree ("vid");