import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { getApiSessionUser } from "@/lib/auth/access";
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

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ items: [] }, { status: 401 });
  }

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

/**
 * Registro ágil de cliente para agenda y mostrador.
 * Permite dar de alta a un cliente en segundos sin salir del modal de cita.
 * Divide inteligentemente el nombre en paterno/materno para mantener el esquema core.
 */
export async function POST(request: NextRequest) {
  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { organizationId, nombreCompleto, telefono, correo, notasOperativas } = body as {
    organizationId?: string;
    nombreCompleto?: string;
    telefono?: string;
    correo?: string;
    notasOperativas?: string;
  };

  if (!organizationId) {
    return NextResponse.json({ error: "Organización requerida" }, { status: 400 });
  }

  const access = await resolveAccessSafe(organizationId, user);
  if (
    !access ||
    (!hasPermission(access, "clientes.editar") && !hasPermission(access, "agenda.editar"))
  ) {
    return NextResponse.json(
      { error: "No tienes permiso para registrar clientes" },
      { status: 403 },
    );
  }

  const nombreLimpio = nombreCompleto?.trim() ?? "";
  if (nombreLimpio.length < 2) {
    return NextResponse.json(
      { error: "El nombre debe tener al menos 2 letras" },
      { status: 400 },
    );
  }

  // Separación inteligente de nombres hispanos
  const partes = nombreLimpio.split(/\s+/).filter(Boolean);
  let nombre = partes[0] ?? "";
  let apellidoPaterno: string | null = null;
  let apellidoMaterno: string | null = null;

  if (partes.length === 2) {
    apellidoPaterno = partes[1];
  } else if (partes.length >= 3) {
    apellidoMaterno = partes[partes.length - 1];
    apellidoPaterno = partes[partes.length - 2];
    nombre = partes.slice(0, -2).join(" ");
  }

  const telLimpio = telefono?.trim() || null;
  const telNorm = telLimpio ? telLimpio.toLowerCase().replace(/\s+/g, "") : null;
  const correoLimpio = correo?.trim() || null;
  const correoNorm = correoLimpio ? correoLimpio.toLowerCase().replace(/\s+/g, "") : null;
  const notas = notasOperativas?.trim() || null;

  const db = getDatabase();

  const [nuevoCliente] = await db
    .insert(clientes)
    .values({
      organizacionId: organizationId,
      nombre,
      apellidoPaterno,
      apellidoMaterno,
      telefono: telLimpio,
      telefonoNormalizado: telNorm,
      correo: correoLimpio,
      correoNormalizado: correoNorm,
      notasOperativas: notas,
    })
    .returning({
      id: clientes.id,
      nombre: clientes.nombre,
      apellidoPaterno: clientes.apellidoPaterno,
      apellidoMaterno: clientes.apellidoMaterno,
      telefono: clientes.telefono,
    });

  const nombreMostrado = [
    nuevoCliente.nombre,
    nuevoCliente.apellidoPaterno,
    nuevoCliente.apellidoMaterno,
  ]
    .filter(Boolean)
    .join(" ");

  return NextResponse.json({
    item: {
      value: nuevoCliente.id,
      label: nombreMostrado,
      description: nuevoCliente.telefono ?? undefined,
    },
  });
}

