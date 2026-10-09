"use server";

import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { clientes, usuarios } from "@/db/schema/core";
import {
  citas,
  clientesConsentimientos,
  clientesFichasTecnicas,
  FICHA_TIPOS,
  type FichaFotoDetalle,
  type FichaInsumo,
} from "@/db/schema/operations";
import { medios } from "@/db/schema/media";
import { productos, servicios } from "@/db/schema/catalogs";
import { auditEvent } from "@/lib/audit";
import { checkPermission, hasPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import {
  fichaFotoDetalleSchema,
  fichaInsumoSchema,
  formatearResumenFormula,
  obtenerConsumosInventario,
} from "@/modules/expedientes/formulas";
import { applyInventoryMovement } from "@/modules/inventory/service";

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
  const access = await checkPermission(input.organizacionId, "clientes.editar");
  if (!access) return { error: "No tienes permiso para editar clientes." };
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
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

const MAX_FOTOS_FICHA = 6;

const fichaSchema = z.object({
  // El formulario genera el id para enlazar las fotos subidas a R2 antes de
  // que la fila exista (medios.entidadId ya apunta a este uuid).
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clienteId: z.string().uuid(),
  sucursalId: z.string().uuid().optional().or(z.literal("")),
  citaId: z.string().uuid().optional().or(z.literal("")),
  servicioId: z.string().uuid().optional().or(z.literal("")),
  tipo: z.enum(FICHA_TIPOS),
  formula: z.string().trim().max(4000).optional().or(z.literal("")),
  insumos: z.string().trim().optional().or(z.literal("")),
  fotosDetalle: z.string().trim().optional().or(z.literal("")),
  tiempoPoseMinutos: z.coerce.number().int().min(0).max(1440).optional().or(z.literal("")),
  notas: z.string().trim().max(4000).optional().or(z.literal("")),
  // Llaves R2 en JSON (string[]) — se verifican contra `medios` antes de
  // guardarlas en el jsonb `fotos`.
  fotos: z.string().trim().max(4000).optional().or(z.literal("")),
  privada: z.literal("true").optional(),
});

export type FichaActionState = { error?: string; success?: boolean; message?: string };

/** Registra una entrada de ficha técnica (fórmula, tratamiento, alergia, nota). */
export async function saveFichaTecnica(
  _previousState: FichaActionState,
  formData: FormData,
): Promise<FichaActionState> {
  const result = fichaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la ficha." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "clientes.editar");
  if (!access) return { error: "No tienes permiso para editar expedientes." };
  const { user } = access;
  const esPrivada = input.privada === "true";
  if (esPrivada && !hasPermission(access, "expedientes.privado")) {
    return { error: "No tienes permiso para crear notas privadas." };
  }
  if (input.tipo === "alergia" && !hasPermission(access, "expedientes.alergias_ver")) {
    return { error: "No tienes permiso para registrar alergias." };
  }
  const db = getDatabase();

  const [cliente] = await db
    .select({ id: clientes.id, nombre: clientes.nombre })
    .from(clientes)
    .where(and(eq(clientes.id, input.clienteId), eq(clientes.organizacionId, input.organizacionId), eq(clientes.activo, true)))
    .limit(1);
  if (!cliente) return { error: "El cliente no existe o está inactivo." };

  if (input.citaId) {
    const [cita] = await db
      .select({ id: citas.id })
      .from(citas)
      .where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId)))
      .limit(1);
    if (!cita) return { error: "La cita asociada no existe." };
  }
  if (input.servicioId) {
    const [servicio] = await db
      .select({ id: servicios.id })
      .from(servicios)
      .where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId), eq(servicios.activo, true)))
      .limit(1);
    if (!servicio) return { error: "El servicio asociado no existe." };
  }

  // Parsear insumos estructurados y fotos con rol
  let insumosParsed: FichaInsumo[] = [];
  if (input.insumos) {
    try {
      const rawInsumos = JSON.parse(input.insumos);
      const parsed = z.array(fichaInsumoSchema).safeParse(rawInsumos);
      if (parsed.success) {
        insumosParsed = parsed.data;
      }
    } catch {
      // Ignorar si no es JSON válido
    }
  }

  let fotosDetalleParsed: FichaFotoDetalle[] = [];
  if (input.fotosDetalle) {
    try {
      const rawFotos = JSON.parse(input.fotosDetalle);
      const parsed = z.array(fichaFotoDetalleSchema).safeParse(rawFotos);
      if (parsed.success) {
        fotosDetalleParsed = parsed.data;
      }
    } catch {
      // Ignorar si no es JSON válido
    }
  }

  const formulaFinal = formatearResumenFormula(insumosParsed, input.formula);

  // Las llaves R2 deben existir en `medios` de la org, ligadas a la ficha que
  // se está creando (entidad 'ficha' + el uuid generado por el formulario).
  let clavesFotos: string[] = [];
  if (input.fotos) {
    try {
      const parsed = JSON.parse(input.fotos) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length <= MAX_FOTOS_FICHA &&
        parsed.every((clave) => typeof clave === "string" && clave.length <= 500)
      ) {
        clavesFotos = [...new Set(parsed as string[])];
      }
    } catch {
      return { error: "Las fotos adjuntas no son válidas." };
    }
  }

  if (fotosDetalleParsed.length > 0) {
    for (const f of fotosDetalleParsed) {
      if (!clavesFotos.includes(f.claveR2) && clavesFotos.length < MAX_FOTOS_FICHA) {
        clavesFotos.push(f.claveR2);
      }
    }
  }

  if (clavesFotos.length > 0) {
    if (!input.id) return { error: "Las fotos no se pudieron asociar a la ficha." };
    const existentes = await db
      .select({ claveR2: medios.claveR2 })
      .from(medios)
      .where(
        and(
          eq(medios.organizacionId, input.organizacionId),
          eq(medios.entidad, "ficha"),
          eq(medios.entidadId, input.id),
          inArray(medios.claveR2, clavesFotos),
        ),
      );
    if (existentes.length !== clavesFotos.length) {
      return { error: "Alguna foto ya no está disponible. Vuelve a subirla." };
    }
  }

  // Resolver sucursal para descuento de inventario
  let targetSucursalId = input.sucursalId || null;
  if (!targetSucursalId && input.citaId) {
    const [citaData] = await db
      .select({ sucursalId: citas.sucursalId })
      .from(citas)
      .where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId)))
      .limit(1);
    if (citaData) targetSucursalId = citaData.sucursalId;
  }

  const consumos = obtenerConsumosInventario(insumosParsed);
  const advertenciasStock: string[] = [];
  if (consumos.length > 0 && targetSucursalId) {
    for (const item of consumos) {
      try {
        const movResult = await applyInventoryMovement(db, {
          organizacionId: input.organizacionId,
          sucursalId: targetSucursalId,
          productoId: item.productoId,
          tipo: "consumo",
          cantidad: item.cantidad,
          notas: `Consumo en servicio: ${item.nombre} (${cliente.nombre})`,
          userId: user.id,
        });
        if (!movResult.success) {
          advertenciasStock.push(`${item.nombre}: ${movResult.error ?? "error de stock"}`);
        }
      } catch (err) {
        console.error("Error al registrar consumo de inventario en ficha:", err);
      }
    }
  }

  await db.insert(clientesFichasTecnicas).values({
    ...(input.id ? { id: input.id } : {}),
    organizacionId: input.organizacionId,
    clienteId: input.clienteId,
    citaId: input.citaId || null,
    servicioId: input.servicioId || null,
    usuarioId: user.id,
    tipo: input.tipo,
    formula: formulaFinal || null,
    insumos: insumosParsed,
    fotosDetalle: fotosDetalleParsed,
    tiempoPoseMinutos: input.tiempoPoseMinutos === "" || input.tiempoPoseMinutos == null ? null : input.tiempoPoseMinutos,
    notas: input.notas || null,
    privada: esPrivada,
    fotos: clavesFotos,
    createdBy: user.id,
  });

  // Las alergias/notas privadas son dato sensible: se audita el tipo sin el contenido.
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: "expediente.ficha_creada",
    entidad: "cliente",
    entidadId: input.clienteId,
    detalle: { tipo: input.tipo, privada: esPrivada, insumosTotal: insumosParsed.length },
  });

  revalidatePath("/admin/clientes");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/mi-dia");

  let message = "Registro guardado en la ficha.";
  if (advertenciasStock.length > 0) {
    message += ` Nota: No se pudo descontar todo el stock (${advertenciasStock.join("; ")}).`;
  }

  return { success: true, message };
}

/** Obtiene el historial previo de fórmulas de un cliente para consulta y replicación rápida. */
export async function getHistorialFormulasCliente(
  organizacionId: string,
  clienteId: string,
  limit = 5,
) {
  const access = await checkPermission(organizacionId, "clientes.ver");
  if (!access) return { error: "Sin permiso para ver expedientes." };
  const db = getDatabase();
  const puedePrivado = hasPermission(access, "expedientes.privado");

  const whereConditions = [
    eq(clientesFichasTecnicas.clienteId, clienteId),
    eq(clientesFichasTecnicas.organizacionId, organizacionId),
    eq(clientesFichasTecnicas.activo, true),
    inArray(clientesFichasTecnicas.tipo, ["color", "tratamiento"]),
  ];

  if (!puedePrivado) {
    whereConditions.push(eq(clientesFichasTecnicas.privada, false));
  }

  const filas = await db
    .select({
      id: clientesFichasTecnicas.id,
      tipo: clientesFichasTecnicas.tipo,
      formula: clientesFichasTecnicas.formula,
      insumos: clientesFichasTecnicas.insumos,
      tiempoPoseMinutos: clientesFichasTecnicas.tiempoPoseMinutos,
      notas: clientesFichasTecnicas.notas,
      fotos: clientesFichasTecnicas.fotos,
      fotosDetalle: clientesFichasTecnicas.fotosDetalle,
      createdAt: clientesFichasTecnicas.createdAt,
      servicioNombre: servicios.nombre,
      autorNombre: usuarios.nombre,
    })
    .from(clientesFichasTecnicas)
    .leftJoin(servicios, eq(clientesFichasTecnicas.servicioId, servicios.id))
    .leftJoin(usuarios, eq(clientesFichasTecnicas.usuarioId, usuarios.id))
    .where(and(...whereConditions))
    .orderBy(desc(clientesFichasTecnicas.createdAt))
    .limit(limit);

  return { success: true, data: filas };
}

/** Obtiene el catálogo de productos disponibles para usarse como insumos en fórmulas. */
export async function getCatalogoInsumos(organizacionId: string) {
  const access = await checkPermission(organizacionId, "clientes.ver");
  if (!access) return { error: "Sin permiso para ver productos." };
  const db = getDatabase();
  const prods = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      sku: productos.sku,
      tipo: productos.tipo,
    })
    .from(productos)
    .where(and(eq(productos.organizacionId, organizacionId), eq(productos.activo, true)))
    .orderBy(asc(productos.nombre))
    .limit(200);

  return { success: true, data: prods };
}

export async function toggleFichaTecnicaActiva(formData: FormData) {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), id: z.string().uuid(), activo: z.literal("true").optional() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const access = await checkPermission(parsed.data.organizacionId, "clientes.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  // Las entradas privadas solo las desactiva quien puede verlas; las alergias
  // requieren el permiso de alergias.
  const [ficha] = await db
    .select({ privada: clientesFichasTecnicas.privada, tipo: clientesFichasTecnicas.tipo })
    .from(clientesFichasTecnicas)
    .where(and(eq(clientesFichasTecnicas.id, parsed.data.id), eq(clientesFichasTecnicas.organizacionId, parsed.data.organizacionId)))
    .limit(1);
  if (ficha?.privada && !hasPermission(access, "expedientes.privado")) return;
  if (ficha?.tipo === "alergia" && !hasPermission(access, "expedientes.alergias_ver")) return;
  await db
    .update(clientesFichasTecnicas)
    .set({ activo: parsed.data.activo !== "true", updatedBy: user.id })
    .where(and(eq(clientesFichasTecnicas.id, parsed.data.id), eq(clientesFichasTecnicas.organizacionId, parsed.data.organizacionId)));
  revalidatePath("/admin/clientes");
}

const consentimientoSchema = z.object({
  organizacionId: z.string().uuid(),
  clienteId: z.string().uuid(),
  citaId: z.string().uuid().optional().or(z.literal("")),
  servicioId: z.string().uuid().optional().or(z.literal("")),
  titulo: z.string().trim().min(3).max(160),
  contenido: z.string().trim().min(10, "El texto del consentimiento es obligatorio.").max(8000),
  firmadoPor: z.string().trim().min(2, "Indica quién firma.").max(160),
  respuesta: z.enum(["aceptado", "rechazado"]),
});

export type ConsentimientoActionState = { error?: string; success?: boolean; message?: string };

/**
 * Registra el consentimiento informado del cliente (aceptado o rechazado) como
 * evidencia legal: texto íntegro, firmante y usuario que lo levantó. No se
 * audita el contenido completo — solo título y respuesta.
 */
export async function saveConsentimiento(
  _previousState: ConsentimientoActionState,
  formData: FormData,
): Promise<ConsentimientoActionState> {
  const result = consentimientoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa el consentimiento." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "clientes.editar");
  if (!access) return { error: "No tienes permiso para editar expedientes." };
  const { user } = access;
  const db = getDatabase();

  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, input.clienteId), eq(clientes.organizacionId, input.organizacionId), eq(clientes.activo, true)))
    .limit(1);
  if (!cliente) return { error: "El cliente no existe o está inactivo." };

  await db.insert(clientesConsentimientos).values({
    organizacionId: input.organizacionId,
    clienteId: input.clienteId,
    citaId: input.citaId || null,
    servicioId: input.servicioId || null,
    usuarioId: user.id,
    titulo: input.titulo,
    contenido: input.contenido,
    firmadoPor: input.firmadoPor,
    respuesta: input.respuesta,
    createdBy: user.id,
  });
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: "expediente.consentimiento",
    entidad: "cliente",
    entidadId: input.clienteId,
    detalle: { titulo: input.titulo, respuesta: input.respuesta },
  });
  revalidatePath("/admin/clientes");
  return { success: true, message: "Consentimiento registrado." };
}

export async function toggleConsentimientoActivo(formData: FormData) {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), id: z.string().uuid(), activo: z.literal("true").optional() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const access = await checkPermission(parsed.data.organizacionId, "clientes.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db
    .update(clientesConsentimientos)
    .set({ activo: parsed.data.activo !== "true", updatedBy: user.id })
    .where(and(eq(clientesConsentimientos.id, parsed.data.id), eq(clientesConsentimientos.organizacionId, parsed.data.organizacionId)));
  revalidatePath("/admin/clientes");
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
  const access = await checkPermission(organizationId, "clientes.editar");
  if (!access) return { error: "No tienes permiso para editar clientes." };
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
  revalidateCatalogos(organizationId);
  return { success: `${rows.length} cliente(s) importado(s).${errors.length > 0 ? ` ${errors.length} fila(s) omitida(s).` : ""}` };
}
