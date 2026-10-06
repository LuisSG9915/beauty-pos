"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productos } from "@/db/schema/catalogs";
import { compras, detalleCompras, proveedores } from "@/db/schema/compras";
import {
  actionError,
  actionSuccess,
  parseWithSchema,
  type ActionState,
} from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import {
  canAccessBranch,
  checkPermission,
  type ResolvedAccess,
} from "@/lib/auth/authorization";
import { isValidDateInput } from "@/lib/format";
import { normalizarTexto } from "@/lib/ia/borrador";
import { applyInventoryMovement } from "@/modules/inventory";
import {
  errorCancelacionCompra,
  errorEdicionCompra,
  errorRecepcionCompra,
  errorResolucionCompra,
  estadoTrasRecibir,
} from "@/modules/compras";

type CompraDb = ReturnType<typeof getDatabase>;

/** Error con mensaje de usuario: al lanzarlo dentro del tx revierte todo. */
class CompraActionError extends Error {}

const idSchema = z.object({
  organizacionId: z.string().uuid(),
  compraId: z.string().uuid(),
});

type CompraBase = {
  id: string;
  sucursalId: string;
  estado: string;
  folio: string | null;
  observaciones: string | null;
  totalTicket: string | null;
  totalCalculado: string;
};

/**
 * Carga la compra con lock `FOR UPDATE` dentro del tx y aplica el guard de
 * transición. Devuelve la fila o lanza `CompraActionError` (rollback total).
 * También valida que la sucursal de la compra caiga en el alcance del usuario.
 */
async function cargarCompraBloqueada(
  tx: Parameters<Parameters<CompraDb["transaction"]>[0]>[0],
  access: ResolvedAccess,
  compraId: string,
  guard?: (estado: string) => string | null,
): Promise<CompraBase> {
  const [compra] = await tx
    .select({
      id: compras.id,
      sucursalId: compras.sucursalId,
      estado: compras.estado,
      folio: compras.folio,
      observaciones: compras.observaciones,
      totalTicket: compras.totalTicket,
      totalCalculado: compras.totalCalculado,
    })
    .from(compras)
    .where(
      and(
        eq(compras.id, compraId),
        eq(compras.organizacionId, access.organizationId),
        eq(compras.activo, true),
      ),
    )
    .limit(1)
    .for("update");
  if (!compra) throw new CompraActionError("La compra no existe.");
  if (!canAccessBranch(access, compra.sucursalId)) {
    throw new CompraActionError("No tienes acceso a la sucursal de esta compra.");
  }
  const error = guard?.(compra.estado);
  if (error) throw new CompraActionError(error);
  return compra;
}

/** Σ importes de las líneas activas → `total_calculado` (una ronda dentro del tx). */
async function recalcularTotal(
  tx: Parameters<Parameters<CompraDb["transaction"]>[0]>[0],
  compraId: string,
  usuarioId: string,
): Promise<void> {
  const { rows } = await tx.execute<{ total: string | number }>(sql`
    select coalesce(sum(${detalleCompras.importe}::numeric), 0) as total
      from ${detalleCompras}
     where ${detalleCompras.compraId} = ${compraId}
       and ${detalleCompras.activo}
  `);
  await tx
    .update(compras)
    .set({ totalCalculado: Number(rows[0]?.total ?? 0).toFixed(2), updatedBy: usuarioId })
    .where(eq(compras.id, compraId));
}

const lineaSchema = z.object({
  organizacionId: z.string().uuid(),
  compraId: z.string().uuid(),
  lineaId: z.string().uuid().optional().or(z.literal("")),
  descripcion: z.string().trim().min(1, "Describe el renglón.").max(240),
  productoId: z.string().uuid().optional().or(z.literal("")),
  cantidad: z.coerce.number().gt(0, "La cantidad debe ser mayor a cero."),
  costoUnitario: z.coerce.number().min(0, "El costo no puede ser negativo."),
  importe: z.coerce.number().min(0, "El importe no puede ser negativo."),
  observacion: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Alta/edición de una línea (solo `borrador`/`por_verificar`). Recalcula
 * `total_calculado` y, siguiendo la máquina de estados, pasa `borrador` →
 * `por_verificar` cuando la captura manual ya tiene ≥ 1 línea activa.
 */
export async function guardarLineaCompra(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    lineaSchema,
    Object.fromEntries(formData.entries()),
    "Revisa los datos de la línea.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "compras.editar");
  if (!access) return actionError("No tienes permiso para editar compras.");
  const { user } = access;
  const db = getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorEdicionCompra);
      const productoId = input.productoId || null;
      if (productoId) {
        const [producto] = await tx
          .select({ id: productos.id })
          .from(productos)
          .where(
            and(
              eq(productos.id, productoId),
              eq(productos.organizacionId, access.organizationId),
              eq(productos.activo, true),
            ),
          )
          .limit(1);
        if (!producto) throw new CompraActionError("El producto elegido no existe o está inactivo.");
      }

      if (input.lineaId) {
        const [actualizada] = await tx
          .update(detalleCompras)
          .set({
            descripcion: input.descripcion,
            productoId,
            cantidad: input.cantidad.toFixed(3),
            costoUnitario: input.costoUnitario.toFixed(2),
            importe: input.importe.toFixed(2),
            observacion: input.observacion || null,
            updatedBy: user.id,
          })
          .where(
            and(
              eq(detalleCompras.id, input.lineaId),
              eq(detalleCompras.compraId, compra.id),
              eq(detalleCompras.activo, true),
            ),
          )
          .returning({ id: detalleCompras.id });
        if (!actualizada) throw new CompraActionError("La línea ya no existe en la compra.");
      } else {
        await tx.insert(detalleCompras).values({
          compraId: compra.id,
          organizacionId: access.organizationId,
          productoId,
          descripcion: input.descripcion,
          cantidad: input.cantidad.toFixed(3),
          costoUnitario: input.costoUnitario.toFixed(2),
          importe: input.importe.toFixed(2),
          observacion: input.observacion || null,
          origen: "manual",
          createdBy: user.id,
        });
      }

      await recalcularTotal(tx, compra.id, user.id);

      // Captura manual con ≥1 línea → por_verificar (transición del plan).
      if (compra.estado === "borrador") {
        await tx
          .update(compras)
          .set({ estado: "por_verificar", updatedBy: user.id })
          .where(eq(compras.id, compra.id));
      }

      return actionSuccess("Línea guardada.");
    });
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("guardarLineaCompra", error);
    return actionError("No se pudo guardar la línea. Intenta de nuevo.");
  }
}

const quitarSchema = idSchema.extend({ lineaId: z.string().uuid() });

/** Baja lógica de una línea (activo=false) y recalcula `total_calculado`. */
export async function quitarLineaCompra(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(quitarSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "compras.editar");
  if (!access) return actionError("No tienes permiso para editar compras.");
  const { user } = access;
  const db = getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorEdicionCompra);
      await tx
        .update(detalleCompras)
        .set({ activo: false, updatedBy: user.id })
        .where(
          and(
            eq(detalleCompras.id, input.lineaId),
            eq(detalleCompras.compraId, compra.id),
            eq(detalleCompras.activo, true),
          ),
        );
      await recalcularTotal(tx, compra.id, user.id);
      return actionSuccess("Línea quitada.");
    });
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("quitarLineaCompra", error);
    return actionError("No se pudo quitar la línea. Intenta de nuevo.");
  }
}

const datosSchema = z.object({
  organizacionId: z.string().uuid(),
  compraId: z.string().uuid(),
  proveedorId: z.string().uuid().optional().or(z.literal("")),
  /** Nombre nuevo: si viene, crea/reutiliza el proveedor por nombre exacto normalizado. */
  proveedorNuevo: z.string().trim().max(160).optional().or(z.literal("")),
  folio: z.string().trim().max(80).optional().or(z.literal("")),
  fechaCompra: z
    .string()
    .trim()
    .refine((valor) => !valor || isValidDateInput(valor), "Usa una fecha válida (AAAA-MM-DD).")
    .optional()
    .or(z.literal("")),
  observaciones: z.string().trim().max(4000).optional().or(z.literal("")),
});

/**
 * Datos generales de la compra: proveedor (id del catálogo o alta por
 * nombre), folio, fecha y observaciones. El `proveedorTexto` del ticket no se
 * toca: conserva lo que leyó la IA.
 */
export async function guardarDatosCompra(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    datosSchema,
    Object.fromEntries(formData.entries()),
    "Revisa los datos de la compra.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "compras.editar");
  if (!access) return actionError("No tienes permiso para editar compras.");
  const { user } = access;
  const db = getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorEdicionCompra);

      let proveedorId = input.proveedorId || null;
      const nombreNuevo = input.proveedorNuevo || "";
      if (nombreNuevo) {
        // Reutiliza el proveedor si ya existe (el único es por nombre exacto;
        // se compara normalizado para no duplicar por mayúsculas/acentos).
        const [existente] = await tx
          .select({ id: proveedores.id })
          .from(proveedores)
          .where(
            and(
              eq(proveedores.organizacionId, access.organizationId),
              eq(sql`lower(${proveedores.nombre})`, normalizarTexto(nombreNuevo)),
            ),
          )
          .limit(1);
        if (existente) {
          proveedorId = existente.id;
        } else {
          const [creado] = await tx
            .insert(proveedores)
            .values({ organizacionId: access.organizationId, nombre: nombreNuevo, createdBy: user.id })
            .returning({ id: proveedores.id });
          proveedorId = creado.id;
        }
      }

      await tx
        .update(compras)
        .set({
          proveedorId,
          folio: input.folio || null,
          fechaCompra: input.fechaCompra || null,
          observaciones: input.observaciones || null,
          updatedBy: user.id,
        })
        .where(eq(compras.id, compra.id));
      return actionSuccess("Datos de la compra guardados.");
    });
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("guardarDatosCompra", error);
    return actionError("No se pudieron guardar los datos. Intenta de nuevo.");
  }
}

const recibirSchema = z.object({
  organizacionId: z.string().uuid(),
  compraId: z.string().uuid(),
  actualizarCostos: z.enum(["true", "false"]).optional(),
  /** JSON: `[{ id, cantidadRecibida, observacion? }]` por línea activa. */
  lineas: z.string(),
});

const lineaRecibidaSchema = z.object({
  id: z.string().uuid(),
  cantidadRecibida: z.coerce.number().min(0, "La cantidad recibida no puede ser negativa."),
  observacion: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * `recibirCompra` (plan 10): la entrada de stock ocurre UNA sola vez, aquí,
 * por la cantidad REAL recibida de cada línea emparejada. La idempotencia la
 * da el estado: la compra se bloquea `FOR UPDATE` y se exige `por_verificar`
 * — un reintento ya la ve `verificada`/`con_observacion` y se rechaza antes
 * de tocar `inventario_stock`.
 */
export async function recibirCompra(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(recibirSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  let recibidas: z.infer<typeof lineaRecibidaSchema>[];
  try {
    const crudas = JSON.parse(input.lineas) as unknown;
    recibidas = z.array(lineaRecibidaSchema).parse(crudas);
  } catch {
    return actionError("Las cantidades recibidas no son válidas.");
  }

  const access = await checkPermission(input.organizacionId, "compras.recibir");
  if (!access) return actionError("No tienes permiso para recibir compras.");
  const { user } = access;
  const actualizarCostos = input.actualizarCostos !== "false";
  const db = getDatabase();

  try {
    const resultado = await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorRecepcionCompra);

      const lineas = await tx
        .select()
        .from(detalleCompras)
        .where(and(eq(detalleCompras.compraId, compra.id), eq(detalleCompras.activo, true)));
      if (lineas.length === 0) {
        throw new CompraActionError("Agrega al menos una línea antes de recibir la compra.");
      }

      const recibidaPorLinea = new Map(recibidas.map((linea) => [linea.id, linea]));
      // default = cantidad pedida cuando la línea no viene en el payload.
      const plan = lineas.map((linea) => {
        const recibida = recibidaPorLinea.get(linea.id);
        const cantidadRecibida =
          recibida === undefined ? Number(linea.cantidad) : recibida.cantidadRecibida;
        if (!Number.isFinite(cantidadRecibida) || cantidadRecibida < 0) {
          throw new CompraActionError("Las cantidades recibidas no son válidas.");
        }
        if (cantidadRecibida > 0 && !linea.productoId) {
          throw new CompraActionError(
            "Empareja todas las líneas o pon recibido 0.",
          );
        }
        return { linea, cantidadRecibida, observacion: recibida?.observacion };
      });

      const notas = `Compra ${compra.folio ?? ""}`.trim();
      for (const { linea, cantidadRecibida, observacion } of plan) {
        await tx
          .update(detalleCompras)
          .set({
            cantidadRecibida: cantidadRecibida.toFixed(3),
            ...(observacion !== undefined ? { observacion: observacion || null } : {}),
            updatedBy: user.id,
          })
          .where(eq(detalleCompras.id, linea.id));

        if (cantidadRecibida > 0 && linea.productoId) {
          const outcome = await applyInventoryMovement(tx, {
            organizacionId: access.organizationId,
            sucursalId: compra.sucursalId,
            productoId: linea.productoId,
            compraId: compra.id,
            tipo: "entrada",
            cantidad: cantidadRecibida,
            notas,
            userId: user.id,
          });
          // Error → abortar: el throw revierte toda la recepción.
          if (!outcome.success) {
            throw new CompraActionError(outcome.error ?? "No se pudo dar entrada al inventario.");
          }
          if (actualizarCostos) {
            await tx
              .update(productos)
              .set({ costo: linea.costoUnitario, updatedBy: user.id })
              .where(
                and(
                  eq(productos.id, linea.productoId),
                  eq(productos.organizacionId, access.organizationId),
                ),
              );
          }
        }
      }

      const { estado, notaTotal } = estadoTrasRecibir({
        lineas: plan.map(({ linea, cantidadRecibida, observacion }) => ({
          cantidad: Number(linea.cantidad),
          cantidadRecibida,
          observacion: observacion !== undefined ? observacion : linea.observacion,
        })),
        observacionesCompra: compra.observaciones,
        totalTicket: compra.totalTicket === null ? null : Number(compra.totalTicket),
        totalCalculado: Number(compra.totalCalculado),
      });
      const observaciones = [compra.observaciones?.trim(), notaTotal]
        .filter(Boolean)
        .join("\n");

      await tx
        .update(compras)
        .set({
          estado,
          observaciones: observaciones || null,
          actualizarCostos,
          recibidaPor: user.id,
          recibidaAt: new Date(),
          updatedBy: user.id,
        })
        .where(eq(compras.id, compra.id));

      await auditEvent(tx, {
        organizacionId: access.organizationId,
        sucursalId: compra.sucursalId,
        usuarioId: user.id,
        accion: "compra.recibida",
        entidad: "compra",
        entidadId: compra.id,
        detalle: { lineas: plan.length, estado, actualizarCostos },
      });
      return estado;
    });

    revalidatePath("/admin/compras");
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/productos");
    return actionSuccess(
      resultado === "con_observacion"
        ? "Recepción registrada con observaciones; revísalas y marca la compra como verificada."
        : "Compra recibida: el inventario ya quedó actualizado.",
    );
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("recibirCompra", error);
    return actionError("No se pudo registrar la recepción. Intenta de nuevo.");
  }
}

const resolverSchema = idSchema.extend({
  nota: z.string().trim().min(1, "Escribe cómo se resolvió la observación.").max(4000),
});

/** `con_observacion` → `verificada` con nota obligatoria; no toca el stock. */
export async function resolverObservacion(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(resolverSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "compras.recibir");
  if (!access) return actionError("No tienes permiso para recibir compras.");
  const { user } = access;
  const db = getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorResolucionCompra);
      const observaciones = [compra.observaciones?.trim(), `Resolución: ${input.nota}`]
        .filter(Boolean)
        .join("\n");
      await tx
        .update(compras)
        .set({
          estado: "verificada",
          observaciones,
          resueltaPor: user.id,
          resueltaAt: new Date(),
          updatedBy: user.id,
        })
        .where(eq(compras.id, compra.id));
      await auditEvent(tx, {
        organizacionId: access.organizationId,
        sucursalId: compra.sucursalId,
        usuarioId: user.id,
        accion: "compra.observacion_resuelta",
        entidad: "compra",
        entidadId: compra.id,
      });
      return actionSuccess("Compra marcada como verificada.");
    });
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("resolverObservacion", error);
    return actionError("No se pudo marcar como verificada. Intenta de nuevo.");
  }
}

/** `borrador`/`por_verificar`/`con_observacion` → `cancelada` (final). */
export async function cancelarCompra(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(idSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "compras.editar");
  if (!access) return actionError("No tienes permiso para editar compras.");
  const { user } = access;
  const db = getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const compra = await cargarCompraBloqueada(tx, access, input.compraId, errorCancelacionCompra);
      await tx
        .update(compras)
        .set({ estado: "cancelada", updatedBy: user.id })
        .where(eq(compras.id, compra.id));
      await auditEvent(tx, {
        organizacionId: access.organizationId,
        sucursalId: compra.sucursalId,
        usuarioId: user.id,
        accion: "compra.cancelada",
        entidad: "compra",
        entidadId: compra.id,
        detalle: { estadoAnterior: compra.estado },
      });
      return actionSuccess("Compra cancelada.");
    });
  } catch (error) {
    if (error instanceof CompraActionError) return actionError(error.message);
    console.error("cancelarCompra", error);
    return actionError("No se pudo cancelar la compra. Intenta de nuevo.");
  }
}
