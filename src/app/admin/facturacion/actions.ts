"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { comprobantes, facturacionConfig, ventas } from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { desglosarIva, rfcValido } from "@/modules/facturacion/sat";
import { pacActivo } from "@/modules/facturacion/pac";

const configSchema = z.object({
  organizacionId: z.string().uuid(),
  rfc: z.string().trim().toUpperCase().min(12).max(13),
  razonSocial: z.string().trim().min(1).max(254),
  regimenFiscal: z.string().trim().length(3),
  codigoPostal: z.string().trim().length(5),
  serie: z.string().trim().max(10).default("A"),
  preciosIncluyenIva: z.coerce.boolean().default(true),
  tasaIva: z.coerce.number().min(0).max(1).default(0.16),
});

const emitirSchema = z.object({
  organizacionId: z.string().uuid(),
  ventaId: z.string().uuid(),
  receptorRfc: z.string().trim().toUpperCase().min(12).max(13),
  receptorNombre: z.string().trim().min(1).max(254),
  receptorRegimen: z.string().trim().length(3),
  // Opcional: "público en general" usa el CP del emisor como domicilio del receptor.
  receptorCp: z.string().trim().max(5).optional(),
  usoCfdi: z.string().trim().min(3).max(4),
  formaPago: z.string().trim().length(2),
  metodoPago: z.string().trim().max(3).default("PUE"),
});

const cancelarSchema = z.object({
  organizacionId: z.string().uuid(),
  comprobanteId: z.string().uuid(),
  motivo: z.enum(["01", "02", "03", "04"]),
  uuidSustitucion: z.string().uuid().optional().or(z.literal("")),
});

/** Guarda la identidad fiscal del emisor (una fila por organización). */
export async function saveConfigFiscal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(configSchema, Object.fromEntries(formData));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  if (!rfcValido(input.rfc)) return actionError("El RFC del emisor no tiene un formato válido.");

  const access = await checkPermission(input.organizacionId, "organizaciones.editar");
  if (!access) return actionError("No tienes permiso para configurar la facturación.");
  const db = getDatabase();

  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .insert(facturacionConfig)
        .values({
          organizacionId: input.organizacionId,
          rfc: input.rfc,
          razonSocial: input.razonSocial,
          regimenFiscal: input.regimenFiscal,
          codigoPostal: input.codigoPostal,
          serie: input.serie || "A",
          preciosIncluyenIva: input.preciosIncluyenIva,
          tasaIva: input.tasaIva.toFixed(4),
          createdBy: access.user.id,
        })
        .onConflictDoUpdate({
          target: facturacionConfig.organizacionId,
          set: {
            rfc: input.rfc,
            razonSocial: input.razonSocial,
            regimenFiscal: input.regimenFiscal,
            codigoPostal: input.codigoPostal,
            serie: input.serie || "A",
            preciosIncluyenIva: input.preciosIncluyenIva,
            tasaIva: input.tasaIva.toFixed(4),
            updatedBy: access.user.id,
          },
        });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        usuarioId: access.user.id,
        accion: "facturacion.configurada",
        entidad: "facturacion_config",
        detalle: { rfc: input.rfc, regimen: input.regimenFiscal },
      });
    }),
  );

  revalidatePath("/admin/facturacion");
  return actionSuccess("Datos del emisor guardados.");
}

/**
 * Emite el CFDI de una venta cobrada. Fases: (1) tx corta — valida, toma
 * folio y crea el borrador; (2) llamada al PAC fuera de la transacción (la
 * latencia no retiene locks); (3) tx corta — timbrada con UUID o `error`
 * reintentable. Un comprobante `timbrada`/`borrador` activo por venta evita
 * dobles emisiones; los de `error`/`cancelada` permiten re-emitir.
 */
export async function emitirFactura(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(emitirSchema, Object.fromEntries(formData));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  if (!rfcValido(input.receptorRfc)) return actionError("El RFC del receptor no tiene un formato válido.");

  const access = await checkPermission(input.organizacionId, "facturacion.emitir");
  if (!access) return actionError("No tienes permiso para emitir comprobantes.");
  const db = getDatabase();

  const preparado = await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [config] = await tx
        .select()
        .from(facturacionConfig)
        .where(and(eq(facturacionConfig.organizacionId, input.organizacionId), eq(facturacionConfig.activo, true)))
        .limit(1)
        .for("update");
      if (!config?.rfc || !config.regimenFiscal || !config.codigoPostal) {
        return actionError("Configura primero los datos del emisor en Comprobantes.");
      }

      const [venta] = await tx
        .select({ id: ventas.id, sucursalId: ventas.sucursalId, estado: ventas.estado, total: ventas.total, clienteId: ventas.clienteId })
        .from(ventas)
        .where(and(eq(ventas.id, input.ventaId), eq(ventas.organizacionId, input.organizacionId), eq(ventas.activo, true)))
        .limit(1)
        .for("update");
      if (!venta) return actionError("La venta no existe.");
      if (!canAccessBranch(access, venta.sucursalId)) return actionError("La venta pertenece a otra sucursal.");
      if (venta.estado !== "completada") return actionError("Solo se generan comprobantes de ventas cobradas.");

      const [existente] = await tx
        .select({ id: comprobantes.id, estado: comprobantes.estado })
        .from(comprobantes)
        .where(
          and(
            eq(comprobantes.ventaId, venta.id),
            eq(comprobantes.organizacionId, input.organizacionId),
            eq(comprobantes.activo, true),
            // Un borrador/timbrado activo bloquea; error/cancelada permiten re-emitir.
            eq(comprobantes.estado, "timbrada"),
          ),
        )
        .limit(1);
      if (existente) return actionError("La venta ya tiene un comprobante emitido.");

      const [borradorPrevio] = await tx
        .select({ id: comprobantes.id })
        .from(comprobantes)
        .where(
          and(
            eq(comprobantes.ventaId, venta.id),
            eq(comprobantes.organizacionId, input.organizacionId),
            eq(comprobantes.activo, true),
            eq(comprobantes.estado, "borrador"),
          ),
        )
        .limit(1);
      if (borradorPrevio) return actionError("Ya hay una emisión en curso para esta venta. Reintenta en unos segundos.");

      const receptorCp = input.receptorCp || config.codigoPostal;

      const folio = config.folioActual + 1;
      await tx
        .update(facturacionConfig)
        .set({ folioActual: folio, updatedBy: access.user.id })
        .where(eq(facturacionConfig.id, config.id));

      const total = Number(venta.total);
      const tasa = Number(config.tasaIva);
      const { subtotal, impuestos } = desglosarIva(total, tasa, config.preciosIncluyenIva);

      const [borrador] = await tx
        .insert(comprobantes)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          ventaId: venta.id,
          clienteId: venta.clienteId,
          estado: "borrador",
          receptorRfc: input.receptorRfc,
          receptorNombre: input.receptorNombre,
          receptorRegimen: input.receptorRegimen,
          receptorCp,
          usoCfdi: input.usoCfdi,
          metodoPago: input.metodoPago || "PUE",
          formaPago: input.formaPago,
          serie: config.serie,
          folio,
          subtotal: subtotal.toFixed(2),
          impuestos: impuestos.toFixed(2),
          total: total.toFixed(2),
          createdBy: access.user.id,
        })
        .returning({ id: comprobantes.id });
      if (!borrador) return actionError("No se pudo crear el comprobante.");
      return { borrador, config, venta, folio, subtotal, impuestos, total };
    }),
  );

  if (!("borrador" in preparado)) return preparado as ActionState;
  const { borrador, config, venta, folio, subtotal, impuestos, total } = preparado;
  const pac = pacActivo(config.pacProveedor);

  // Llamada al PAC fuera de la transacción.
  let timbrado: { uuid: string; respuesta?: Record<string, unknown> } | null = null;
  let errorTimbrado: string | null = null;
  try {
    timbrado = await pac.timbrar({
      serie: config.serie ?? "A",
      folio,
      subtotal,
      impuestos,
      total,
      moneda: "MXN",
      metodoPago: input.metodoPago || "PUE",
      formaPago: input.formaPago,
      usoCfdi: input.usoCfdi,
      emisor: {
        rfc: config.rfc!,
        razonSocial: config.razonSocial ?? "",
        regimenFiscal: config.regimenFiscal!,
        codigoPostal: config.codigoPostal!,
      },
      receptor: {
        rfc: input.receptorRfc,
        nombre: input.receptorNombre,
        regimenFiscal: input.receptorRegimen,
        codigoPostal: input.receptorCp || config.codigoPostal!,
      },
    });
  } catch (error) {
    errorTimbrado = error instanceof Error ? error.message : "Error desconocido del PAC.";
  }

  const cierre = await withDbRetry(() =>
    db.transaction(async (tx) => {
      if (timbrado) {
        await tx
          .update(comprobantes)
          .set({
            estado: "timbrada",
            uuid: timbrado.uuid,
            pacProveedor: pac.clave,
            pacRespuesta: timbrado.respuesta ?? null,
            timbradoAt: new Date(),
            updatedBy: access.user.id,
          })
          .where(eq(comprobantes.id, borrador.id));
        await auditEvent(tx, {
          organizacionId: input.organizacionId,
          sucursalId: venta.sucursalId,
          usuarioId: access.user.id,
          accion: "factura.timbrada",
          entidad: "comprobante",
          entidadId: borrador.id,
          detalle: { ventaId: venta.id, uuid: timbrado.uuid, total, pac: pac.clave },
        });
        return actionSuccess("Comprobante emitido (folio simulado).", { comprobanteId: borrador.id });
      }
      await tx
        .update(comprobantes)
        .set({ estado: "error", error: errorTimbrado ?? "El PAC no respondió.", updatedBy: access.user.id })
        .where(eq(comprobantes.id, borrador.id));
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: venta.sucursalId,
        usuarioId: access.user.id,
        accion: "factura.error",
        entidad: "comprobante",
        entidadId: borrador.id,
        detalle: { ventaId: venta.id, error: errorTimbrado },
      });
      return actionError(`No se pudo emitir: ${errorTimbrado ?? "el PAC no respondió"}. La emisión quedó registrada para reintentar.`);
    }),
  );

  revalidatePath("/admin/pos");
  revalidatePath("/admin/facturacion");
  return cierre;
}

/** Cancela un comprobante timbrado ante el PAC y lo marca `cancelada`. */
export async function cancelarFactura(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(cancelarSchema, Object.fromEntries(formData));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  if (input.motivo === "01" && !input.uuidSustitucion) {
    return actionError("El motivo 01 requiere el UUID del comprobante que lo sustituye.");
  }

  const access = await checkPermission(input.organizacionId, "facturacion.cancelar");
  if (!access) return actionError("No tienes permiso para cancelar comprobantes.");
  const db = getDatabase();

  const [comprobante] = await db
    .select()
    .from(comprobantes)
    .where(and(eq(comprobantes.id, input.comprobanteId), eq(comprobantes.organizacionId, input.organizacionId), eq(comprobantes.activo, true)))
    .limit(1);
  if (!comprobante) return actionError("El comprobante no existe.");
  if (!canAccessBranch(access, comprobante.sucursalId)) return actionError("El comprobante pertenece a otra sucursal.");
  if (comprobante.estado !== "timbrada") return actionError("Solo se cancelan comprobantes emitidos.");
  if (!comprobante.uuid) return actionError("El comprobante no tiene folio.");

  const pac = pacActivo(comprobante.pacProveedor);
  try {
    const resultado = await pac.cancelar(comprobante.uuid, input.motivo, input.uuidSustitucion || null);
    if (!resultado.ok) return actionError("El PAC rechazó la cancelación.");
  } catch (error) {
    return actionError(error instanceof Error ? `No se pudo cancelar: ${error.message}` : "No se pudo cancelar.");
  }

  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .update(comprobantes)
        .set({
          estado: "cancelada",
          motivoCancelacion: input.motivo,
          uuidSustitucion: input.uuidSustitucion || null,
          canceladoAt: new Date(),
          updatedBy: access.user.id,
        })
        .where(eq(comprobantes.id, comprobante.id));
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: comprobante.sucursalId,
        usuarioId: access.user.id,
        accion: "factura.cancelada",
        entidad: "comprobante",
        entidadId: comprobante.id,
        detalle: { uuid: comprobante.uuid, motivo: input.motivo },
      });
    }),
  );

  revalidatePath("/admin/pos");
  revalidatePath("/admin/facturacion");
  return actionSuccess("Comprobante cancelado.");
}
