import { asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { hasPermission, resolveAccess } from "@/lib/auth/authorization";

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return Response.json({ error: "organizationId es requerido" }, { status: 400 });
  }

  const access = await resolveAccess(organizationId);
  if (!hasPermission(access, "clientes.ver")) {
    return Response.json({ error: "Sin permiso para exportar clientes" }, { status: 403 });
  }
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
    .where(eq(clientes.organizacionId, organizationId))
    .orderBy(asc(clientes.nombre));

  const headers = Object.keys(rows[0] ?? {
    nombre: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    telefono: "",
    correo: "",
    fechaNacimiento: "",
    notasOperativas: "",
    rfc: "",
    razonSocial: "",
    codigoPostalFiscal: "",
    regimenFiscal: "",
    usoCfdi: "",
  });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header as keyof typeof row])).join(","))].join("\r\n");

  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=clientes.csv",
    },
  });
}
