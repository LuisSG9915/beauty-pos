import "dotenv/config";

import { getDatabase } from "@/db/client";
import { PLANES_CATALOGO } from "@/modules/billing/capacidades";
import { sincronizarCatalogoPlanes } from "@/modules/billing/service";

/**
 * Siembra el catálogo de planes de lanzamiento (Esencial, Crecimiento,
 * Profesional) con upsert por clave. Idempotente: se puede correr en cada
 * despliegue o cuando cambien precios/capacidades del catálogo.
 */
async function main() {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await sincronizarCatalogoPlanes(tx);
  });
  for (const plan of PLANES_CATALOGO) {
    console.log(
      `Plan sincronizado: ${plan.clave} — ${plan.nombre} ($${plan.precioMensual}/mes, incluye ${plan.sucursalesIncluidas} sucursal(es)` +
        `${plan.precioSucursalExtra ? `, extra $${plan.precioSucursalExtra}/mes` : ""})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo sembrar el catálogo de planes.");
  process.exitCode = 1;
});
