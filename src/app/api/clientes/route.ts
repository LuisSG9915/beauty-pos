import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";

const LIMITE = 20;

/**
 * Búsqueda remota de clientes para selectores (agenda, cobro). Requiere poder
 * editar la agenda o ver clientes dentro de la organización; devuelve solo
 * campos de identificación — nunca notas ni datos fiscales.
 */
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() ?? "";
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!organizationId || q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(organizationId, user);
  if (
    !access ||
    (!hasPermission(access, "agenda.editar") && !hasPermission(access, "clientes.ver"))
  ) {
    return NextResponse.json({ items: [] }, { status: 403 });
  }

  const patron = `%${q}%`;
  const digitos = q.replace(/\D/g, "");
  const filtros = [
    ilike(clientes.nombre, patron),
    ilike(clientes.apellidoPaterno, patron),
    ilike(clientes.apellidoMaterno, patron),
  ];
  if (digitos.length >= 4) {
    filtros.push(ilike(clientes.telefonoNormalizado, `%${digitos}%`));
  }

  const db = getDatabase();
  const rows = await db
    .select({
      id: clientes.id,
      nombre: sql<string>`trim(concat_ws(' ', ${clientes.nombre}, ${clientes.apellidoPaterno}, ${clientes.apellidoMaterno}))`,
      telefono: clientes.telefono,
    })
    .from(clientes)
    .where(
      and(
        eq(clientes.organizacionId, organizationId),
        eq(clientes.activo, true),
        or(...filtros),
      ),
    )
    .orderBy(asc(clientes.nombre))
    .limit(LIMITE);

  return NextResponse.json({
    items: rows.map((row) => ({
      value: row.id,
      label: row.nombre,
      description: row.telefono ?? undefined,
    })),
  });
}
