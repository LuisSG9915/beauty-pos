import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { MiDiaBoard, type MiDiaCita } from "@/app/admin/mi-dia/mi-dia-board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { servicios } from "@/db/schema/catalogs";
import {
  citas,
  detalleCitasServicios,
  detalleVentasComisiones,
  detalleVentasPropinas,
  ventas,
} from "@/db/schema/operations";
import { getAdminContext } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { dayBoundsUtc } from "@/modules/agenda";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
}>;

/**
 * Vista personal del estilista: solo las citas asignadas al usuario logueado
 * en la sucursal activa, con su resumen de propinas y comisiones del día.
 */
export default async function MiDiaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { user, organization, branch, organizationId, timeZone, currency } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description="Tus citas, propinas y comisiones del día."
          title="Mi día"
        />
        <EmptyState
          description="Tu usuario no tiene una organización activa asignada."
          title="Sin organización"
        />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description={`${organization.nombre} · ${timeZone}`}
          title="Mi día"
        />
        <EmptyState
          description={`${organization.nombre} no tiene una sucursal activa para operar.`}
          title="No hay sucursales activas"
        />
      </div>
    );
  }

  requireAccessPermission(context.access, "agenda.ver");

  const fecha = todayDateInput(timeZone);
  const bounds = dayBoundsUtc(fecha, timeZone);
  if (!bounds) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description={`${branch.nombre} · ${timeZone}`} title="Mi día" />
        <EmptyState description="No se pudo resolver el día actual." title="Fecha inválida" />
      </div>
    );
  }

  const db = getDatabase();

  const citaRows = await db
    .select({
      id: citas.id,
      fechaHora: citas.fechaHora,
      duracionMinutos: citas.duracionMinutos,
      estado: citas.estado,
      notas: citas.notas,
      totalEstimado: citas.totalEstimado,
      clienteId: clientes.id,
      clienteNombre: clientes.nombre,
      clienteNotas: clientes.notasOperativas,
      ventaId: ventas.id,
      ventaEstado: ventas.estado,
    })
    .from(citas)
    .leftJoin(clientes, eq(citas.clienteId, clientes.id))
    .leftJoin(ventas, and(eq(ventas.citaId, citas.id), eq(ventas.activo, true)))
    .where(
      and(
        eq(citas.organizacionId, organization.id),
        eq(citas.sucursalId, branch.id),
        eq(citas.usuarioId, user.id),
        eq(citas.activo, true),
        gte(citas.fechaHora, bounds.iniciaAt),
        lt(citas.fechaHora, bounds.terminaAt),
      ),
    )
    .orderBy(asc(citas.fechaHora));

  const citaIds = citaRows.map((row) => row.id);
  const detalles = citaIds.length > 0
    ? await db
        .select({ citaId: detalleCitasServicios.citaId, nombre: servicios.nombre })
        .from(detalleCitasServicios)
        .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
        .where(
          and(
            inArray(detalleCitasServicios.citaId, citaIds),
            eq(detalleCitasServicios.activo, true),
          ),
        )
    : [];

  const serviciosPorCita = new Map<string, string[]>();
  for (const detalle of detalles) {
    const list = serviciosPorCita.get(detalle.citaId) ?? [];
    list.push(detalle.nombre);
    serviciosPorCita.set(detalle.citaId, list);
  }

  // Ventas del día de la sucursal para acotar propinas/comisiones al turno.
  const ventasDelDia = await db
    .select({ id: ventas.id })
    .from(ventas)
    .where(
      and(
        eq(ventas.organizacionId, organization.id),
        eq(ventas.sucursalId, branch.id),
        eq(ventas.activo, true),
        gte(ventas.createdAt, bounds.iniciaAt),
        lt(ventas.createdAt, bounds.terminaAt),
      ),
    );
  const ventaIds = ventasDelDia.map((row) => row.id);

  const [propinaRows, comisionRows] = ventaIds.length > 0
    ? await Promise.all([
        db
          .select({ monto: detalleVentasPropinas.monto })
          .from(detalleVentasPropinas)
          .where(
            and(
              eq(detalleVentasPropinas.usuarioId, user.id),
              eq(detalleVentasPropinas.activo, true),
              inArray(detalleVentasPropinas.ventaId, ventaIds),
            ),
          ),
        db
          .select({ monto: detalleVentasComisiones.monto })
          .from(detalleVentasComisiones)
          .where(
            and(
              eq(detalleVentasComisiones.usuarioId, user.id),
              eq(detalleVentasComisiones.activo, true),
              inArray(detalleVentasComisiones.ventaId, ventaIds),
            ),
          ),
      ])
    : [[], []];

  const suma = (rows: Array<{ monto: string }>) =>
    rows.reduce((total, row) => total + Number(row.monto), 0);

  const citasSerializadas: MiDiaCita[] = citaRows.map((row) => ({
    id: row.id,
    fechaHora: row.fechaHora.toISOString(),
    duracionMinutos: row.duracionMinutos,
    estado: row.estado,
    notas: row.notas,
    totalEstimado: row.totalEstimado,
    clienteId: row.clienteId,
    clienteNombre: row.clienteNombre ?? "Walk-in",
    clienteNotas: row.clienteNotas,
    ventaId: row.ventaId,
    ventaEstado: row.ventaEstado,
    servicios: serviciosPorCita.get(row.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · ${timeZone}`}
        title="Mi día"
      />
      <MiDiaBoard
        citas={citasSerializadas}
        currency={currency}
        fecha={fecha}
        organizationId={organizationId ?? organization.id}
        resumen={{
          completadas: citasSerializadas.filter((cita) => cita.estado === "completada").length,
          pendientes: citasSerializadas.filter((cita) =>
            ["pendiente", "confirmada", "en_proceso"].includes(cita.estado),
          ).length,
          propinas: suma(propinaRows),
          comisiones: suma(comisionRows),
        }}
        sucursalId={branch.id}
        timeZone={timeZone}
      />
    </div>
  );
}
