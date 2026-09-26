import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";

import { MiDiaBoard, type MiDiaCita } from "@/app/admin/mi-dia/mi-dia-board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
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
import { GLOSARIO } from "@/lib/glosario";
import { buildAdminHref } from "@/lib/url-context";
import { dayBoundsUtc } from "@/modules/agenda";
import { alergiasPorCliente, conAlergias } from "@/modules/expedientes/alergias";

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

  // Las citas y los agregados monetarios son independientes: lanzarlos juntos
  // evita dos idas y vueltas extra a Postgres antes de que la pantalla exista.
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const [citaRows, propinaRows, comisionRows] = await Promise.all([
    db
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
      .orderBy(asc(citas.fechaHora)),
    db
      .select({ total: sql<string>`coalesce(sum(${detalleVentasPropinas.monto}), 0)` })
      .from(detalleVentasPropinas)
      .innerJoin(ventas, eq(detalleVentasPropinas.ventaId, ventas.id))
      .where(
        and(
          eq(detalleVentasPropinas.usuarioId, user.id),
          eq(detalleVentasPropinas.activo, true),
          eq(ventas.organizacionId, organization.id),
          eq(ventas.sucursalId, branch.id),
          eq(ventas.activo, true),
          gte(fechaVenta, bounds.iniciaAt),
          lt(fechaVenta, bounds.terminaAt),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${detalleVentasComisiones.monto}), 0)` })
      .from(detalleVentasComisiones)
      .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
      .where(
        and(
          eq(detalleVentasComisiones.usuarioId, user.id),
          eq(detalleVentasComisiones.activo, true),
          eq(ventas.organizacionId, organization.id),
          eq(ventas.sucursalId, branch.id),
          eq(ventas.activo, true),
          gte(fechaVenta, bounds.iniciaAt),
          lt(fechaVenta, bounds.terminaAt),
        ),
      ),
  ]);

  const citaIds = citaRows.map((row) => row.id);
  const clienteIdsVisibles = [
    ...new Set(citaRows.map((row) => row.clienteId).filter((id): id is string => Boolean(id))),
  ];
  const [detalles, alergias] = await Promise.all([
    citaIds.length > 0
      ? db
          .select({ citaId: detalleCitasServicios.citaId, nombre: servicios.nombre })
          .from(detalleCitasServicios)
          .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
          .where(
            and(
              inArray(detalleCitasServicios.citaId, citaIds),
              eq(detalleCitasServicios.activo, true),
            ),
          )
      : Promise.resolve([] as Array<{ citaId: string; nombre: string }>),
    // Alergias del expediente — visibles solo con `expedientes.alergias_ver`.
    alergiasPorCliente(db, organization.id, clienteIdsVisibles, context.access),
  ]);

  const serviciosPorCita = new Map<string, string[]>();
  for (const detalle of detalles) {
    const list = serviciosPorCita.get(detalle.citaId) ?? [];
    list.push(detalle.nombre);
    serviciosPorCita.set(detalle.citaId, list);
  }

  const propinas = Number(propinaRows[0]?.total ?? 0);
  const comisiones = Number(comisionRows[0]?.total ?? 0);

  const citasSerializadas: MiDiaCita[] = citaRows.map((row) => ({
    id: row.id,
    fechaHora: row.fechaHora.toISOString(),
    duracionMinutos: row.duracionMinutos,
    estado: row.estado,
    notas: row.notas,
    totalEstimado: row.totalEstimado,
    clienteId: row.clienteId,
    clienteNombre: row.clienteNombre ?? GLOSARIO.clienteDePaso,
    clienteNotas: conAlergias(row.clienteNotas, row.clienteId ? alergias.get(row.clienteId) : undefined),
    ventaId: row.ventaId,
    ventaEstado: row.ventaEstado,
    servicios: serviciosPorCita.get(row.id) ?? [],
  }));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button
            data-action-clave="1"
            data-action-id="mi_dia.agenda.abrir"
            nativeButton={false}
            render={<Link href={buildAdminHref("/agenda", { organizationId: organization.id, sucursalId: branch.id })} />}
            size="lg"
            variant="outline"
          >
            Ver agenda
          </Button>
        }
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
          propinas,
          comisiones,
        }}
        sucursalId={branch.id}
        timeZone={timeZone}
      />
    </div>
  );
}
