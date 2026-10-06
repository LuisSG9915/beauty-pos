"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productos } from "@/db/schema/catalogs";
import { compras, detalleCompras } from "@/db/schema/compras";
import { organizaciones } from "@/db/schema/core";
import {
  actionError,
  actionSuccess,
  parseWithSchema,
  type ActionState,
} from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { assertBranchScope, checkPermission } from "@/lib/auth/authorization";
import { ejecutarTextoJson, getAi } from "@/lib/ia/cliente";
import {
  IA_JSON_SCHEMA_REABASTO,
  IA_SISTEMA_REABASTO,
  MODELO_RESUMEN_TEXTO,
  iaInstruccionReabasto,
  resumenReabastoIaSchema,
} from "@/lib/ia/esquemas";
import { consumirCuotaIa } from "@/lib/ia/uso";
import { kvReadThrough } from "@/lib/kv-cache";
import {
  calcularReabastecimiento,
  construirEntradaResumen,
  filaCrudaAEntrada,
  filtrarPuntosResumen,
  hash8,
  normalizarDiasObjetivo,
} from "@/modules/reportes/reabastecimiento";
import { cargarReabastecimiento } from "@/modules/reportes/reabastecimiento-queries";

/** Error con mensaje de usuario: al lanzarlo dentro del tx revierte todo. */
class ReabastoActionError extends Error {}

// ── Crear compra borrador desde la selección ─────────────────────────────────

const crearCompraSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  /** JSON `[{ productoId, cantidad }]` con la selección de la tabla. */
  lineas: z.string(),
});

const lineaSeleccionSchema = z.object({
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().gt(0).max(999_999),
});

/**
 * Crea una compra `borrador` sin foto con líneas `origen='manual'` emparejadas
 * al catálogo (plan 12 → flujo del plan 10). El costo lo toma de
 * `productos.costo` en el servidor — nunca del cliente — y la entrada de
 * stock sigue ocurriendo solo cuando una persona recibe la compra.
 */
export async function crearCompraDesdeReabasto(
  formData: FormData,
): Promise<ActionState<{ compraId: string }>> {
  const parsed = parseWithSchema(
    crearCompraSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la selección.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  let seleccion: z.infer<typeof lineaSeleccionSchema>[];
  try {
    seleccion = z.array(lineaSeleccionSchema).max(200).parse(JSON.parse(input.lineas));
  } catch {
    return actionError("La selección de productos no es válida.");
  }
  if (seleccion.length === 0) {
    return actionError("Selecciona al menos un producto con cantidad mayor a cero.");
  }

  const access = await checkPermission(input.organizacionId, "compras.editar");
  if (!access) return actionError("No tienes permiso para crear compras.");
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return actionError("No tienes acceso a esa sucursal.");
  }
  const { user } = access;
  const db = getDatabase();

  // Junta duplicados por si el mismo producto llega dos veces.
  const cantidadPorProducto = new Map<string, number>();
  for (const linea of seleccion) {
    cantidadPorProducto.set(
      linea.productoId,
      (cantidadPorProducto.get(linea.productoId) ?? 0) + linea.cantidad,
    );
  }

  try {
    const compraId = await db.transaction(async (tx) => {
      const catalogo = await tx
        .select({ id: productos.id, nombre: productos.nombre, costo: productos.costo })
        .from(productos)
        .where(
          and(
            eq(productos.organizacionId, access.organizationId),
            eq(productos.activo, true),
            inArray(productos.id, [...cantidadPorProducto.keys()]),
          ),
        );
      if (catalogo.length !== cantidadPorProducto.size) {
        throw new ReabastoActionError(
          "Algún producto de la selección ya no existe o está inactivo.",
        );
      }

      const [compra] = await tx
        .insert(compras)
        .values({
          organizacionId: access.organizationId,
          sucursalId: input.sucursalId,
          estado: "borrador",
          createdBy: user.id,
        })
        .returning({ id: compras.id });

      let total = 0;
      const valores = catalogo.map((producto) => {
        const cantidad = cantidadPorProducto.get(producto.id) ?? 0;
        const costo = Number(producto.costo ?? 0);
        const importe = Math.round(cantidad * costo * 100) / 100;
        total += importe;
        return {
          compraId: compra.id,
          organizacionId: access.organizationId,
          productoId: producto.id,
          descripcion: producto.nombre,
          cantidad: cantidad.toFixed(3),
          costoUnitario: costo.toFixed(2),
          importe: importe.toFixed(2),
          origen: "manual" as const,
          createdBy: user.id,
        };
      });
      await tx.insert(detalleCompras).values(valores);
      await tx
        .update(compras)
        .set({ totalCalculado: total.toFixed(2), updatedBy: user.id })
        .where(eq(compras.id, compra.id));

      await auditEvent(tx, {
        organizacionId: access.organizationId,
        sucursalId: input.sucursalId,
        usuarioId: user.id,
        accion: "compra.creada",
        entidad: "compra",
        entidadId: compra.id,
        detalle: { origen: "reabastecimiento", lineas: valores.length },
      });
      return compra.id;
    });

    revalidatePath("/admin/compras");
    revalidatePath("/admin/inventario/reabastecer");
    return actionSuccess("Compra creada como borrador; revísala en Compras.", {
      compraId,
    });
  } catch (error) {
    if (error instanceof ReabastoActionError) return actionError(error.message);
    console.error("crearCompraDesdeReabasto", error);
    return actionError("No se pudo crear la compra. Intenta de nuevo.");
  }
}

// ── Resumen IA del reporte ───────────────────────────────────────────────────

const resumenSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  dias: z.coerce.number(),
});

/** La cuota del mes se agotó (se distingue para dar el mensaje del plan). */
class CuotaAgotada extends Error {
  constructor(public readonly limite: number) {
    super("cuota");
  }
}

/** El modelo no devolvió puntos fieles a los datos; no se cachea. */
class ResumenSinPuntosFieles extends Error {}

const TTL_RESUMEN_S = 21_600;

/**
 * Redacta el resumen del reporte con Workers AI (opcional, bajo demanda del
 * botón). Los números se recalculan en el servidor — nunca se aceptan del
 * cliente — y la respuesta del modelo se filtra contra el JSON de entrada:
 * un punto que mencione un número ausente se descarta.
 *
 * Caché KV `reabasto:v1:{org}:{sucursal}:{N}:{hash8(JSON de entrada)}` con TTL
 * de 6 h (plan). La cuota se consume dentro del loader: un acierto de caché
 * no gasta capturas y los fallos (cuota, IA caída, 0 puntos fieles) no se
 * cachean — la persona puede reintentar.
 */
export async function generarResumenReabasto(
  formData: FormData,
): Promise<ActionState<{ puntos: string[] }>> {
  const parsed = parseWithSchema(resumenSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const dias = normalizarDiasObjetivo(input.dias);

  const access = await checkPermission(input.organizacionId, "inventario.ver");
  if (!access) return actionError("No tienes permiso para ver el inventario.");
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return actionError("No tienes acceso a esa sucursal.");
  }
  if (!getAi()) {
    return actionError("El resumen con IA no está disponible en este entorno.");
  }

  const db = getDatabase();

  try {
    const [organizacion, filasCrudas] = await Promise.all([
      db
        .select({ moneda: organizaciones.moneda })
        .from(organizaciones)
        .where(eq(organizaciones.id, access.organizationId))
        .limit(1),
      cargarReabastecimiento(db, {
        organizacionId: access.organizationId,
        sucursalId: input.sucursalId,
      }),
    ]);

    const ahora = new Date();
    const resultado = calcularReabastecimiento(
      filasCrudas.map((fila) => filaCrudaAEntrada(fila, ahora)),
      dias,
    );
    const entrada = construirEntradaResumen(resultado, {
      moneda: organizacion[0]?.moneda ?? "MXN",
    });
    const entradaJson = JSON.stringify(entrada);
    const claveCache = `reabasto:v1:${access.organizationId}:${input.sucursalId}:${dias}:${hash8(entradaJson)}`;

    const puntos = await kvReadThrough(claveCache, TTL_RESUMEN_S, async () => {
      const cuota = await consumirCuotaIa(db, access.organizationId, "texto");
      if (!cuota.ok) throw new CuotaAgotada(cuota.limite);
      const salida = await ejecutarTextoJson({
        modelo: MODELO_RESUMEN_TEXTO,
        system: IA_SISTEMA_REABASTO,
        instruccion: iaInstruccionReabasto(entradaJson),
        jsonSchema: IA_JSON_SCHEMA_REABASTO,
        zod: resumenReabastoIaSchema,
      });
      const fieles = filtrarPuntosResumen(salida.puntos, entrada);
      if (fieles.length === 0) throw new ResumenSinPuntosFieles();
      return fieles;
    });

    return actionSuccess(undefined, { puntos });
  } catch (error) {
    if (error instanceof CuotaAgotada) {
      return actionError(
        `Llegaste al límite de ${error.limite} lecturas con IA de este mes.`,
      );
    }
    if (error instanceof ResumenSinPuntosFieles) {
      return actionError("No se pudo generar el resumen.");
    }
    console.error("generarResumenReabasto", error);
    return actionError("No se pudo generar el resumen. Intenta de nuevo.");
  }
}
