"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { requireOrganizationAccess } from "@/lib/auth/access";

const clientSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  nombre: z.string().trim().min(2).max(100),
  apellidoPaterno: z.string().trim().max(100).optional().or(z.literal("")),
  apellidoMaterno: z.string().trim().max(100).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  correo: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  fechaNacimiento: z.string().trim().optional().or(z.literal("")),
  notasOperativas: z.string().trim().max(4000).optional().or(z.literal("")),
  rfc: z.string().trim().toUpperCase().max(13).optional().or(z.literal("")),
  razonSocial: z.string().trim().max(254).optional().or(z.literal("")),
  codigoPostalFiscal: z.string().trim().max(5).optional().or(z.literal("")),
  regimenFiscal: z.string().trim().max(3).optional().or(z.literal("")),
  usoCfdi: z.string().trim().max(4).optional().or(z.literal("")),
  confirmarDuplicado: z.literal("true").optional(),
});

export type ClientActionState = { error?: string; warning?: string; success?: boolean };
export type ImportClientsState = { error?: string; success?: string };

function normalize(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "") || null;
}

export async function saveClient(_previousState: ClientActionState, formData: FormData): Promise<ClientActionState> {
  const raw = Object.fromEntries(formData.entries());
  const result = clientSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del cliente." };

  const input = result.data;
  await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();
  const telefonoNormalizado = normalize(input.telefono);
  const correoNormalizado = normalize(input.correo);
  const duplicateConditions = [];
  if (telefonoNormalizado) duplicateConditions.push(eq(clientes.telefonoNormalizado, telefonoNormalizado));
  if (correoNormalizado) duplicateConditions.push(eq(clientes.correoNormalizado, correoNormalizado));

  if (duplicateConditions.length > 0) {
    const conditions = [eq(clientes.organizacionId, input.organizacionId), or(...duplicateConditions)];
    if (input.id) conditions.push(ne(clientes.id, input.id));
    const duplicates = await db.select({ nombre: clientes.nombre }).from(clientes).where(and(...conditions));
    if (duplicates.length > 0 && input.confirmarDuplicado !== "true") return { warning: `Ya existe un cliente con datos coincidentes: ${duplicates.map((item) => item.nombre).join(", ")}. Confirma para continuar.` };
  }

  const values = {
    organizacionId: input.organizacionId,
    nombre: input.nombre,
    apellidoPaterno: input.apellidoPaterno || null,
    apellidoMaterno: input.apellidoMaterno || null,
    telefono: input.telefono || null,
    telefonoNormalizado,
    correo: input.correo || null,
    correoNormalizado,
    fechaNacimiento: input.fechaNacimiento || null,
    notasOperativas: input.notasOperativas || null,
    rfc: input.rfc || null,
    razonSocial: input.razonSocial || null,
    codigoPostalFiscal: input.codigoPostalFiscal || null,
    regimenFiscal: input.regimenFiscal || null,
    usoCfdi: input.usoCfdi || null,
  };

  if (input.id) await db.update(clientes).set(values).where(and(eq(clientes.id, input.id), eq(clientes.organizacionId, input.organizacionId)));
  else await db.insert(clientes).values(values);

  revalidatePath("/admin/clientes");
  return { success: true };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { values.push(value); value = ""; continue; }
    value += character;
  }
  values.push(value);
  return values;
}

export async function importClients(_previousState: ImportClientsState, formData: FormData): Promise<ImportClientsState> {
  const organizationId = String(formData.get("organizacionId") ?? "");
  await requireOrganizationAccess(organizationId);
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo CSV." };
  if (file.size > 5 * 1024 * 1024) return { error: "El archivo no puede superar 5 MB." };

  const lines = (await file.text()).replace(/^\ufeff/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { error: "El CSV debe incluir encabezados y al menos una fila." };
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const db = getDatabase();
  const rows = [];
  const errors: string[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
    const result = clientSchema.safeParse({ ...row, organizacionId: organizationId, confirmarDuplicado: "true" });
    if (!result.success) { errors.push(`Fila ${index + 1}: ${result.error.issues[0]?.message ?? "datos inválidos"}`); continue; }
    const input = result.data;
    rows.push({
      organizacionId: organizationId,
      nombre: input.nombre,
      apellidoPaterno: input.apellidoPaterno || null,
      apellidoMaterno: input.apellidoMaterno || null,
      telefono: input.telefono || null,
      telefonoNormalizado: normalize(input.telefono),
      correo: input.correo || null,
      correoNormalizado: normalize(input.correo),
      fechaNacimiento: input.fechaNacimiento || null,
      notasOperativas: input.notasOperativas || null,
      rfc: input.rfc || null,
      razonSocial: input.razonSocial || null,
      codigoPostalFiscal: input.codigoPostalFiscal || null,
      regimenFiscal: input.regimenFiscal || null,
      usoCfdi: input.usoCfdi || null,
    });
  }

  if (rows.length > 0) await db.insert(clientes).values(rows);
  revalidatePath("/admin/clientes");
  return { success: `${rows.length} cliente(s) importado(s).${errors.length > 0 ? ` ${errors.length} fila(s) omitida(s).` : ""}` };
}
