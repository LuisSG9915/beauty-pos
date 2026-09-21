import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { auditEvent } from "@/lib/audit";
import { hasPermission, resolveAccess } from "@/lib/auth/authorization";
import { filaCsv } from "@/modules/reportes/rules";

const COLUMNAS_BASICAS = [
  "nombre",
  "apellidoPaterno",
  "apellidoMaterno",
  "telefono",
  "correo",
  "fechaNacimiento",
] as const;

const COLUMNAS_SENSIBLES = [
  "notasOperativas",
  "rfc",
  "razonSocial",
  "codigoPostalFiscal",
  "regimenFiscal",
  "usoCfdi",
] as const;

/**
 * GET /admin/clientes/export — CSV de clientes activos.
 * `clientes.exportar`: columnas de contacto (nombre, teléfono, correo,
 * nacimiento). `?incluirSensibles=1` agrega notas operativas y datos fiscales
 * solo con `clientes.exportar_sensible`. Celdas saneadas contra fórmulas
 * (`=`, `+`, `-`, `@`) y cada descarga queda en bitácora.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return Response.json({ error: "organizationId es requerido" }, { status: 400 });
  }

  const access = await resolveAccess(organizationId);
  if (!hasPermission(access, "clientes.exportar")) {
    return Response.json({ error: "Sin permiso para exportar clientes" }, { status: 403 });
  }

  const incluirSensibles =
    url.searchParams.get("incluirSensibles") === "1" &&
    hasPermission(access, "clientes.exportar_sensible");

  const db = getDatabase();
  const rows = await db
    .select({
      nombre: clientes.nombre,
      apellidoPaterno: clientes.apellidoPaterno,
      apellidoMaterno: clientes.apellidoMaterno,
      telefono: clientes.telefono,
      correo: clientes.correo,
      fechaNacimiento: clientes.fechaNacimiento,
      notasOperativas: clientes.notasOperativas,
      rfc: clientes.rfc,
      razonSocial: clientes.razonSocial,
      codigoPostalFiscal: clientes.codigoPostalFiscal,
      regimenFiscal: clientes.regimenFiscal,
      usoCfdi: clientes.usoCfdi,
    })
    .from(clientes)
    .where(and(eq(clientes.organizacionId, organizationId), eq(clientes.activo, true)))
    .orderBy(asc(clientes.nombre));

  const columnas = incluirSensibles
    ? [...COLUMNAS_BASICAS, ...COLUMNAS_SENSIBLES]
    : [...COLUMNAS_BASICAS];
  const lineas = [
    columnas.join(","),
    ...rows.map((row) => filaCsv(columnas.map((col) => row[col]))),
  ];

  await auditEvent(db, {
    organizacionId: organizationId,
    usuarioId: access.user.id,
    accion: "clientes.exportados",
    entidad: "cliente",
    detalle: { registros: rows.length, incluirSensibles },
  });

  return new Response(`\ufeff${lineas.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=clientes.csv",
      // Datos de clientes por organización: nunca cacheables ni compartibles.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
