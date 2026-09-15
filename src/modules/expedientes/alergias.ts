import { and, eq, inArray } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import { clientesFichasTecnicas } from "@/db/schema/operations";
import { hasPermission, type ResolvedAccess } from "@/lib/auth/authorization";

type Db = ReturnType<typeof getDatabase>;

/**
 * Alergias activas del expediente por cliente, para mostrarlas en agenda/mi día.
 * Devuelve un mapa vacío cuando el usuario no tiene `expedientes.alergias_ver`;
 * las entradas privadas además requieren `expedientes.privado`.
 */
export async function alergiasPorCliente(
  db: Db,
  organizacionId: string,
  clienteIds: string[],
  access: ResolvedAccess,
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (clienteIds.length === 0 || !hasPermission(access, "expedientes.alergias_ver")) return resultado;

  const rows = await db
    .select({
      clienteId: clientesFichasTecnicas.clienteId,
      notas: clientesFichasTecnicas.notas,
      formula: clientesFichasTecnicas.formula,
      privada: clientesFichasTecnicas.privada,
    })
    .from(clientesFichasTecnicas)
    .where(
      and(
        eq(clientesFichasTecnicas.organizacionId, organizacionId),
        eq(clientesFichasTecnicas.tipo, "alergia"),
        eq(clientesFichasTecnicas.activo, true),
        inArray(clientesFichasTecnicas.clienteId, clienteIds),
      ),
    );

  const puedePrivado = hasPermission(access, "expedientes.privado");
  for (const row of rows) {
    if (row.privada && !puedePrivado) continue;
    const texto = row.notas ?? row.formula;
    if (!texto) continue;
    const actual = resultado.get(row.clienteId);
    resultado.set(row.clienteId, actual ? `${actual} · ${texto}` : texto);
  }
  return resultado;
}

/** Concatena "Alergias: …" a las notas operativas del cliente. */
export function conAlergias(notas: string | null, alergias: string | undefined): string | null {
  if (!alergias) return notas;
  const aviso = `Alergias: ${alergias}`;
  return notas ? `${notas}\n${aviso}` : aviso;
}
