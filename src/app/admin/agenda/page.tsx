import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { AgendaBoard, type AgendaBloqueo, type AgendaCita, type AgendaHorario } from "@/app/admin/agenda/agenda-board";
import { AgendaToolbar } from "@/app/admin/agenda/agenda-toolbar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { clientes, miembrosOrganizaciones, relUsuariosSucursales, usuarios } from "@/db/schema/core";
import { bloqueosAgenda, citas, detalleCitasServicios, horariosSucursales, ventas } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { getAdminContext } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { firstParam, normalizeDateInput, normalizeView } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey, weekStartDateKey } from "@/modules/agenda";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
  fecha?: string | string[];
  vista?: string | string[];
  q?: string | string[];
}>;

const AGENDA_VIEWS = ["dia", "semana", "lista"] as const;

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, branches, organizationId, sucursalId, timeZone, currency } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description="Administra citas, profesionales y ventas por sucursal."
          title="Agenda de citas"
        />
        <EmptyState
          description="Tu usuario no tiene una organización activa asignada."
          title="Sin organización"
        />
      </div>
    );
  }

  requireAccessPermission(context.access, "agenda.ver");

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description="Administra citas, profesionales y ventas por sucursal."
          title="Agenda de citas"
        />
        <EmptyState
          description={`${organization.nombre} no tiene una sucursal activa para operar la agenda.`}
          title="No hay sucursales activas"
        />
      </div>
    );
  }

  const fecha = normalizeDateInput(params.fecha, todayDateInput(timeZone)) ?? todayDateInput(timeZone);
  const vista = normalizeView(params.vista, AGENDA_VIEWS, "dia");
  const q = firstParam(params.q)?.toLowerCase() ?? "";
  const inicioSemana = vista === "semana" ? (weekStartDateKey(fecha, timeZone) ?? fecha) : fecha;
  const finKey =
    vista === "semana"
      ? (shiftDateKey(inicioSemana, 7) ?? inicioSemana)
      : vista === "lista"
        ? (shiftDateKey(fecha, 14) ?? fecha)
        : (shiftDateKey(fecha, 1) ?? fecha);
  const inicioBounds = dayBoundsUtc(vista === "semana" ? inicioSemana : fecha, timeZone);
  const finBounds = dayBoundsUtc(finKey, timeZone);

  if (!inicioBounds || !finBounds) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="La fecha seleccionada no es válida." title="Agenda de citas" />
        <EmptyState description="Elige una fecha válida para consultar la agenda." title="Fecha inválida" />
      </div>
    );
  }

  const [staffRows, clientRows, serviceRows, horarioRows, bloqueoRows, citaRows] = await Promise.all([
    getDatabase()
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(relUsuariosSucursales)
      .innerJoin(usuarios, eq(relUsuariosSucursales.usuarioId, usuarios.id))
      .innerJoin(
        miembrosOrganizaciones,
        and(
          eq(miembrosOrganizaciones.usuarioId, usuarios.id),
          eq(miembrosOrganizaciones.organizacionId, organization.id),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      )
      .where(
        and(
          eq(relUsuariosSucursales.organizacionId, organization.id),
          eq(relUsuariosSucursales.sucursalId, branch.id),
          eq(usuarios.activo, true),
        ),
      )
      .orderBy(asc(usuarios.nombre)),
    getDatabase()
      .select({ id: clientes.id, nombre: clientes.nombre, telefono: clientes.telefono })
      .from(clientes)
      .where(and(eq(clientes.organizacionId, organization.id), eq(clientes.activo, true)))
      .orderBy(asc(clientes.nombre)),
    getDatabase()
      .select({ id: servicios.id, nombre: servicios.nombre, precioBase: servicios.precioBase, duracionMinutos: servicios.duracionMinutos })
      .from(servicios)
      .where(and(eq(servicios.organizacionId, organization.id), eq(servicios.activo, true)))
      .orderBy(asc(servicios.nombre)),
    getDatabase()
      .select({ diaSemana: horariosSucursales.diaSemana, iniciaMinutos: horariosSucursales.iniciaMinutos, terminaMinutos: horariosSucursales.terminaMinutos })
      .from(horariosSucursales)
      .where(
        and(
          eq(horariosSucursales.organizacionId, organization.id),
          eq(horariosSucursales.sucursalId, branch.id),
          eq(horariosSucursales.activo, true),
        ),
      )
      .orderBy(asc(horariosSucursales.diaSemana), asc(horariosSucursales.iniciaMinutos)),
    getDatabase()
      .select({ id: bloqueosAgenda.id, usuarioId: bloqueosAgenda.usuarioId, iniciaAt: bloqueosAgenda.iniciaAt, terminaAt: bloqueosAgenda.terminaAt, tipo: bloqueosAgenda.tipo, motivo: bloqueosAgenda.motivo })
      .from(bloqueosAgenda)
      .where(
        and(
          eq(bloqueosAgenda.organizacionId, organization.id),
          eq(bloqueosAgenda.sucursalId, branch.id),
          eq(bloqueosAgenda.activo, true),
          lt(bloqueosAgenda.iniciaAt, finBounds.iniciaAt),
          gte(bloqueosAgenda.terminaAt, inicioBounds.iniciaAt),
        ),
      ),
    getDatabase()
      .select({
        id: citas.id,
        fechaHora: citas.fechaHora,
        duracionMinutos: citas.duracionMinutos,
        estado: citas.estado,
        notas: citas.notas,
        totalEstimado: citas.totalEstimado,
        clienteId: citas.clienteId,
        clienteNombre: clientes.nombre,
        clienteTelefono: clientes.telefono,
        clienteNotas: clientes.notasOperativas,
        sucursalId: citas.sucursalId,
        usuarioId: citas.usuarioId,
        ventaId: ventas.id,
      })
      .from(citas)
      .leftJoin(clientes, eq(citas.clienteId, clientes.id))
      .leftJoin(ventas, and(eq(ventas.citaId, citas.id), eq(ventas.activo, true)))
      .where(
        and(
          eq(citas.organizacionId, organization.id),
          eq(citas.sucursalId, branch.id),
          eq(citas.activo, true),
          gte(citas.fechaHora, inicioBounds.iniciaAt),
          lt(citas.fechaHora, finBounds.iniciaAt),
        ),
      )
      .orderBy(asc(citas.fechaHora)),
  ]);

  const citaIds = citaRows.map((row) => row.id);
  const detalles = citaIds.length > 0
    ? await getDatabase()
        .select({ citaId: detalleCitasServicios.citaId, servicioId: detalleCitasServicios.servicioId, nombre: servicios.nombre, precio: detalleCitasServicios.precio })
        .from(detalleCitasServicios)
        .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
        .where(and(inArray(detalleCitasServicios.citaId, citaIds), eq(detalleCitasServicios.activo, true)))
    : [];

  const serviciosPorCita = new Map<string, Array<{ id: string; nombre: string; precio: string }>>();
  for (const detalle of detalles) {
    const list = serviciosPorCita.get(detalle.citaId) ?? [];
    list.push({ id: detalle.servicioId, nombre: detalle.nombre, precio: detalle.precio });
    serviciosPorCita.set(detalle.citaId, list);
  }
  const staffPorId = new Map(staffRows.map((staff) => [staff.id, staff.nombre]));

  const citasSerializadas: AgendaCita[] = citaRows
    .map((row) => ({
      id: row.id,
      fechaHora: row.fechaHora.toISOString(),
      duracionMinutos: row.duracionMinutos,
      estado: row.estado,
      notas: row.notas,
      totalEstimado: row.totalEstimado,
      clienteId: row.clienteId,
      clienteNombre: row.clienteNombre ?? "Walk-in",
      clienteTelefono: row.clienteTelefono,
      clienteNotas: row.clienteNotas,
      sucursalId: row.sucursalId,
      usuarioId: row.usuarioId,
      usuarioNombre: row.usuarioId ? (staffPorId.get(row.usuarioId) ?? "Profesional") : null,
      ventaId: row.ventaId,
      servicios: serviciosPorCita.get(row.id) ?? [],
    }))
    .filter((cita) => {
      if (!q) return true;
      const texto = [cita.clienteNombre, cita.usuarioNombre, cita.notas, cita.estado, ...cita.servicios.map((servicio) => servicio.nombre)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(q);
    });

  const horarios: AgendaHorario[] = horarioRows;
  const bloqueos: AgendaBloqueo[] = bloqueoRows.map((row) => ({
    id: row.id,
    usuarioId: row.usuarioId,
    iniciaAt: row.iniciaAt.toISOString(),
    terminaAt: row.terminaAt.toISOString(),
    tipo: row.tipo,
    motivo: row.motivo,
  }));
  const weekDays = vista === "semana"
    ? Array.from({ length: 7 }, (_, index) => shiftDateKey(inicioSemana, index) ?? inicioSemana)
    : [fecha];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · ${timeZone}`}
        title="Agenda de citas"
      />
      <AgendaToolbar
        branches={branches.map((item) => ({ id: item.id, nombre: item.nombre, clave: item.clave }))}
        fecha={fecha}
        hoy={todayDateInput(timeZone)}
        q={q}
        sucursalId={sucursalId ?? branch.id}
        vista={vista}
      />
      <AgendaBoard
        bloqueos={bloqueos}
        citas={citasSerializadas}
        clientes={clientRows}
        currency={currency}
        fecha={fecha}
        horarios={horarios}
        organizationId={organizationId ?? organization.id}
        servicios={serviceRows}
        staff={staffRows}
        sucursal={branch}
        timeZone={timeZone}
        vista={vista}
        weekDays={weekDays}
      />
    </div>
  );
}
