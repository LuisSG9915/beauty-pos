import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { compras, detalleCompras, proveedores } from "@/db/schema/compras";
import { productos } from "@/db/schema/catalogs";
import { sucursales, organizaciones } from "@/db/schema/core";
import { medios } from "@/db/schema/media";
import { auditEvent } from "@/lib/audit";
import { getApiSessionUser } from "@/lib/auth/access";
import { canAccessBranch, hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import { ejecutarVisionJson, getAi, IaNoDisponible } from "@/lib/ia/cliente";
import {
  IA_INSTRUCCION_TICKET,
  IA_JSON_SCHEMA_TICKET,
  IA_MAX_TOKENS_TICKET,
  IA_SISTEMA_TICKET,
  MODELO_LECTURA_TICKET,
  ticketCompraIaSchema,
} from "@/lib/ia/esquemas";
import { consumirCuotaIa } from "@/lib/ia/uso";
import { todayDateInput } from "@/lib/format";
import { mediaGet } from "@/lib/media";
import { procesarTicketIa } from "@/modules/compras";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El modelo de visión solo admite jpeg/png (mismo criterio que plan 08). */
const MIMES_IA = new Set(["image/jpeg", "image/png"]);

/** Re-análisis permitido mientras la compra no esté recibida ni cerrada. */
const ESTADOS_ANALIZABLES = new Set(["borrador", "por_verificar"]);

/**
 * Análisis del ticket de compra (plan 10 — diseño cerrado: sin Queues; corre
 * en la MISMA petición). Lee la foto de R2, la pasa a Workers AI con el
 * prompt/esquema cerrado de `src/lib/ia/esquemas.ts`, aplica el post-proceso
 * determinista de `src/modules/compras/rules.ts` y deja la compra en
 * `por_verificar` con las líneas `origen='ia'` reemplazadas.
 *
 * La IA NUNCA toca inventario: solo produce el borrador de líneas que la
 * recepcionista revisa. Si falla o tarda >45 s, la compra queda como estaba
 * con `analisisError` para mostrar "Reintentar" en la UI.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Compra no encontrada." }, { status: 404 });
  }

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para analizar tickets." }, { status: 401 });
  }

  const db = getDatabase();
  const [compra] = await db
    .select({
      id: compras.id,
      organizacionId: compras.organizacionId,
      sucursalId: compras.sucursalId,
      estado: compras.estado,
      medioTicketId: compras.medioTicketId,
      activo: compras.activo,
      zonaHorariaSucursal: sucursales.zonaHoraria,
      zonaHorariaOrg: organizaciones.zonaHoraria,
    })
    .from(compras)
    .innerJoin(sucursales, eq(compras.sucursalId, sucursales.id))
    .innerJoin(organizaciones, eq(compras.organizacionId, organizaciones.id))
    .where(eq(compras.id, id))
    .limit(1);

  // 404 (no 403): no filtrar si la compra existe en otra organización.
  if (!compra || !compra.activo) {
    return NextResponse.json({ error: "Compra no encontrada." }, { status: 404 });
  }
  const access = await resolveAccessSafe(compra.organizacionId, user);
  if (!access || !hasPermission(access, "compras.editar")) {
    return NextResponse.json(
      { error: "No tienes permiso para editar compras." },
      { status: 403 },
    );
  }
  // La sucursal ya viene de la compra (FK); basta el chequeo de alcance en
  // memoria, sin la consulta extra de `assertBranchScope`.
  if (!canAccessBranch(access, compra.sucursalId)) {
    return NextResponse.json(
      { error: "Esta compra pertenece a otra sucursal." },
      { status: 403 },
    );
  }
  if (!ESTADOS_ANALIZABLES.has(compra.estado)) {
    return NextResponse.json(
      { error: "La compra ya fue recibida o cancelada; no se puede volver a leer el ticket." },
      { status: 409 },
    );
  }
  if (!compra.medioTicketId) {
    return NextResponse.json(
      { error: "Esta compra no tiene foto de ticket. Captura las líneas a mano." },
      { status: 400 },
    );
  }

  const [medio] = await db
    .select({ claveR2: medios.claveR2, mime: medios.mime, activo: medios.activo })
    .from(medios)
    .where(eq(medios.id, compra.medioTicketId))
    .limit(1);
  if (!medio?.activo || !MIMES_IA.has(medio.mime)) {
    return NextResponse.json(
      { error: "La foto del ticket no está disponible en un formato legible." },
      { status: 400 },
    );
  }

  if (!getAi()) {
    return NextResponse.json(
      { error: "La lectura con IA no está disponible en este entorno." },
      { status: 503 },
    );
  }

  const cuota = await consumirCuotaIa(db, compra.organizacionId, "ticket");
  if (!cuota.ok) {
    return NextResponse.json(
      { error: `Llegaste al límite de ${cuota.limite} lecturas con IA de este mes.` },
      { status: 429 },
    );
  }

  const objeto = await mediaGet(medio.claveR2);
  if (!objeto) {
    return NextResponse.json(
      { error: "No se encontró la foto del ticket en el almacenamiento." },
      { status: 404 },
    );
  }

  /** Registra el motivo del fallo sin cambiar el estado (Reintentar en UI). */
  const registrarError = async (mensaje: string) => {
    await db
      .update(compras)
      .set({ analisisError: mensaje, updatedBy: user.id })
      .where(eq(compras.id, compra.id));
  };

  let salida;
  try {
    salida = await ejecutarVisionJson({
      modelo: MODELO_LECTURA_TICKET,
      system: IA_SISTEMA_TICKET,
      instruccion: IA_INSTRUCCION_TICKET,
      imagen: {
        bytes: await objeto.arrayBuffer(),
        mime: medio.mime as "image/jpeg" | "image/png",
      },
      jsonSchema: IA_JSON_SCHEMA_TICKET,
      zod: ticketCompraIaSchema,
      maxTokens: IA_MAX_TOKENS_TICKET,
    });
  } catch (error) {
    const mensaje =
      error instanceof IaNoDisponible
        ? "La lectura con IA no está disponible en este entorno."
        : error instanceof Error
          ? error.message
          : "No pudimos leer el ticket.";
    await registrarError(mensaje);
    if (error instanceof IaNoDisponible) {
      return NextResponse.json({ error: mensaje }, { status: 503 });
    }
    return NextResponse.json(
      { error: "No pudimos leer el ticket. Puedes reintentar o capturar a mano." },
      { status: 502 },
    );
  }

  const hoy = todayDateInput(compra.zonaHorariaSucursal ?? compra.zonaHorariaOrg);
  const [proveedoresOrg, productosOrg] = await Promise.all([
    db
      .select({ id: proveedores.id, nombre: proveedores.nombre })
      .from(proveedores)
      .where(and(eq(proveedores.organizacionId, compra.organizacionId), eq(proveedores.activo, true))),
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        sku: productos.sku,
        codigoBarras: productos.codigoBarras,
      })
      .from(productos)
      .where(and(eq(productos.organizacionId, compra.organizacionId), eq(productos.activo, true))),
  ]);

  const resultado = procesarTicketIa(salida, {
    proveedores: proveedoresOrg,
    productos: productosOrg,
    hoy,
  });
  // `analisis_ia` guarda la salida validada (nunca la imagen) con las dudas
  // ya enriquecidas por el post-proceso (renglones descartados incluidos).
  const analisisIa = { ...salida, dudas: resultado.dudas };

  try {
    await db.transaction(async (tx) => {
      // Lock de la compra: el estado de origen se revalida dentro de la
      // transacción para que dos análisis concurrentes no se pisen.
      const [bloqueada] = await tx
        .select({ estado: compras.estado })
        .from(compras)
        .where(eq(compras.id, compra.id))
        .limit(1)
        .for("update");
      if (!bloqueada || !ESTADOS_ANALIZABLES.has(bloqueada.estado)) {
        throw new Error("LA_COMPRA_CAMBIO_DE_ESTADO");
      }

      // Reemplaza solo las líneas que venían de IA; las capturadas a mano se
      // conservan (baja lógica, como el resto del esquema).
      await tx
        .update(detalleCompras)
        .set({ activo: false, updatedBy: user.id })
        .where(
          and(
            eq(detalleCompras.compraId, compra.id),
            eq(detalleCompras.origen, "ia"),
            eq(detalleCompras.activo, true),
          ),
        );

      if (resultado.lineas.length > 0) {
        await tx.insert(detalleCompras).values(
          resultado.lineas.map((linea) => ({
            compraId: compra.id,
            organizacionId: compra.organizacionId,
            productoId: linea.productoId,
            descripcion: linea.descripcion.slice(0, 240),
            cantidad: linea.cantidad.toFixed(3),
            costoUnitario: linea.costoUnitario.toFixed(2),
            importe: linea.importe.toFixed(2),
            origen: "ia" as const,
            createdBy: user.id,
          })),
        );
      }

      // Σ importes de TODAS las líneas activas (ia nuevas + manuales previas).
      const { rows } = await tx.execute<{ total: string | number }>(sql`
        select coalesce(sum(${detalleCompras.importe}::numeric), 0) as total
          from ${detalleCompras}
         where ${detalleCompras.compraId} = ${compra.id}
           and ${detalleCompras.activo}
      `);
      const totalCalculado = Number(rows[0]?.total ?? 0);

      await tx
        .update(compras)
        .set({
          // Solo se pisan los datos que la IA sí leyó; el resto conserva lo
          // capturado a mano (p. ej. proveedor elegido antes del reintento).
          ...(resultado.proveedorId || resultado.proveedorTexto
            ? {
                proveedorId: resultado.proveedorId,
                proveedorTexto: resultado.proveedorTexto,
              }
            : {}),
          ...(resultado.folio ? { folio: resultado.folio } : {}),
          ...(resultado.totalTicket !== null ? { totalTicket: resultado.totalTicket.toFixed(2) } : {}),
          fechaCompra: resultado.fechaCompra,
          totalCalculado: totalCalculado.toFixed(2),
          analisisIa,
          analisisError: null,
          estado: "por_verificar",
          updatedBy: user.id,
        })
        .where(eq(compras.id, compra.id));

      await auditEvent(tx, {
        organizacionId: compra.organizacionId,
        sucursalId: compra.sucursalId,
        usuarioId: user.id,
        accion: "compra.analizada",
        entidad: "compra",
        entidadId: compra.id,
        detalle: { lineas: resultado.lineas.length, dudas: resultado.dudas.length },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LA_COMPRA_CAMBIO_DE_ESTADO") {
      return NextResponse.json(
        { error: "La compra cambió de estado mientras se leía el ticket. Recarga la página." },
        { status: 409 },
      );
    }
    console.error("analizarCompra", error);
    await registrarError("Error interno al guardar el análisis.").catch(() => {});
    return NextResponse.json(
      { error: "No pudimos guardar la lectura del ticket. Intenta de nuevo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, lineas: resultado.lineas.length, dudas: resultado.dudas });
}
