/**
 * Entry point del Worker (ver `main` en `wrangler.jsonc`).
 *
 * El adapter de OpenNext solo genera un handler `fetch` en
 * `.open-next/worker.js`; el cron de avisos por correo
 * (`triggers.crons` en `wrangler.jsonc`) necesita además un handler
 * `scheduled`. Este archivo envuelve el handler generado y lo añade
 * (patrón "custom worker" de OpenNext).
 *
 * El `scheduled` invoca el route handler `/api/cron/recordatorios` con
 * `handler.fetch` — una llamada interna, sin red ni Cloudflare Access — y el
 * mismo `ExecutionContext` del evento, para que el pool de la BD se cierre
 * con `after()`.
 */

// `@ts-expect-error` no sirve aquí: tras `opennextjs-cloudflare build` el
// archivo existe y TS lo marca como directiva sin usar. El import es válido en
// ambos estados (checkout limpio y build hecho).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` se genera con `opennextjs-cloudflare build`.
import handler from "./.open-next/worker.js";
import { esRutaPublicaAccess } from "./src/lib/auth/access";

type Env = {
  CRON_SECRET?: string;
  [binding: string]: unknown;
};

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // Cortocircuito: rutas públicas nunca exigen validación de Zero Trust ni cabeceras de Access
    if (esRutaPublicaAccess(url.pathname)) {
      return handler.fetch(request, env, ctx);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    try {
      const respuesta = await handler.fetch(
        new Request("https://cron.interno/api/cron/recordatorios", {
          headers: env.CRON_SECRET ? { authorization: `Bearer ${env.CRON_SECRET}` } : {},
        }),
        env,
        ctx,
      );
      if (!respuesta.ok) {
        console.error(`[cron] recordatorios respondió ${respuesta.status}`);
      }
    } catch (error) {
      // Un fallo del cron no debe tumbar el Worker: se registra y el
      // siguiente disparo reintenta (el lease por aviso evita duplicados).
      console.error("[cron] error procesando recordatorios:", error);
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;

// El DO Queue, el Sharded Tag Cache y la purga de bucket del adapter deben
// re-exportarse para que los bindings sigan funcionando.
// `@ts-expect-error` no sirve aquí: tras `opennextjs-cloudflare build` el
// archivo existe y TS lo marca como directiva sin usar. El import es válido en
// ambos estados (checkout limpio y build hecho).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` se genera con `opennextjs-cloudflare build`.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
