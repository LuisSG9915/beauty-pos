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

  if (!organizationId) {
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

  const db = getDatabase();
  const nombreCompleto = sql<string>`trim(concat_ws(' ', ${clientes.nombre}, ${clientes.apellidoPaterno}, ${clientes.apellidoMaterno}))`;

  let whereCond;
  if (!q) {
    // Sin término de búsqueda: devuelve los primeros clientes activos para que el selector no esté vacío.
    whereCond = and(
      eq(clientes.organizacionId, organizationId),
      eq(clientes.activo, true),
    );
  } else {
    const patron = `%${q}%`;
    const digitos = q.replace(/\D/g, "");
    const palabras = q.split(/\s+/).filter((p) => p.length > 0);

    const filtros = [
      ilike(nombreCompleto, patron),
      ilike(clientes.correo, patron),
    ];

    // Si el usuario escribió varias palabras (ej. "María López"), buscar que contenga cada una
    if (palabras.length > 1) {
      const matchPalabras = and(...palabras.map((p) => ilike(nombreCompleto, `%${p}%`)));
      if (matchPalabras) {
        filtros.push(matchPalabras);
      }
    }

    if (digitos.length >= 3) {
      filtros.push(ilike(clientes.telefonoNormalizado, `%${digitos}%`));
      filtros.push(ilike(clientes.telefono, `%${digitos}%`));
    }

    whereCond = and(
      eq(clientes.organizacionId, organizationId),
      eq(clientes.activo, true),
      or(...filtros),
    );
  }

  const rows = await db
    .select({
      id: clientes.id,
      nombre: nombreCompleto,
      telefono: clientes.telefono,
      correo: clientes.correo,
    })
    .from(clientes)
    .where(whereCond)
    .orderBy(asc(clientes.nombre))
    .limit(LIMITE);

  return NextResponse.json({
    items: rows.map((row) => ({
      value: row.id,
      label: row.nombre,
      description: row.telefono || row.correo || undefined,
    })),
  });
}
