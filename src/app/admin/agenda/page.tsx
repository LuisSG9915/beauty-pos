import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { AgendaBoard, type AgendaBloqueo, type AgendaCita, type AgendaHorario } from "@/app/admin/agenda/agenda-board";
import { AgendaToolbar } from "@/app/admin/agenda/agenda-toolbar";
import {
  DisponibilidadPanel,
  type BloqueoConfig,
  type HorarioConfig,
  type RecursoConfig,
} from "@/app/admin/agenda/disponibilidad-panel";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { clientes, miembrosOrganizaciones, relUsuariosSucursales, sucursales, usuarios } from "@/db/schema/core";
import { bloqueosAgenda, citaRecursos, citas, detalleCitasServicios, horariosSucursales, recursos, ventas } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { firstParam, normalizeDateInput, normalizeView } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey, weekStartDateKey } from "@/modules/agenda";
import { alergiasPorCliente, conAlergias } from "@/modules/expedientes/alergias";

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

  const [staffRows, clientRows, serviceRows, horarioRows, bloqueoRows, recursoRows, citaRows] = await Promise.all([
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
      .select({ id: horariosSucursales.id, diaSemana: horariosSucursales.diaSemana, iniciaMinutos: horariosSucursales.iniciaMinutos, terminaMinutos: horariosSucursales.terminaMinutos, activo: horariosSucursales.activo })
      .from(horariosSucursales)
      .where(
        and(
          eq(horariosSucursales.organizacionId, organization.id),
          eq(horariosSucursales.sucursalId, branch.id),
        ),
      )
      .orderBy(asc(horariosSucursales.diaSemana), asc(horariosSucursales.iniciaMinutos)),
    getDatabase()
      .select({ id: bloqueosAgenda.id, usuarioId: bloqueosAgenda.usuarioId, iniciaAt: bloqueosAgenda.iniciaAt, terminaAt: bloqueosAgenda.terminaAt, tipo: bloqueosAgenda.tipo, motivo: bloqueosAgenda.motivo, activo: bloqueosAgenda.activo })
      .from(bloqueosAgenda)
      .where(
        and(
          eq(bloqueosAgenda.organizacionId, organization.id),
          eq(bloqueosAgenda.sucursalId, branch.id),
        ),
      )
      .orderBy(asc(bloqueosAgenda.iniciaAt)),
    getDatabase()
      .select({ id: recursos.id, nombre: recursos.nombre, tipo: recursos.tipo, capacidad: recursos.capacidad, activo: recursos.activo })
      .from(recursos)
      .where(and(eq(recursos.organizacionId, organization.id), eq(recursos.sucursalId, branch.id)))
      .orderBy(asc(recursos.nombre)),
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
        version: citas.version,
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
  const [detalles, detallesRecursos] = citaIds.length > 0
    ? await Promise.all([
        getDatabase()
          .select({ citaId: detalleCitasServicios.citaId, servicioId: detalleCitasServicios.servicioId, nombre: servicios.nombre, precio: detalleCitasServicios.precio })
          .from(detalleCitasServicios)
          .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
          .where(and(inArray(detalleCitasServicios.citaId, citaIds), eq(detalleCitasServicios.activo, true))),
        getDatabase()
          .select({ citaId: citaRecursos.citaId, recursoId: citaRecursos.recursoId, nombre: recursos.nombre })
          .from(citaRecursos)
          .innerJoin(recursos, eq(citaRecursos.recursoId, recursos.id))
          .where(and(inArray(citaRecursos.citaId, citaIds), eq(citaRecursos.activo, true))),
      ])
    : [[], []];

  const serviciosPorCita = new Map<string, Array<{ id: string; nombre: string; precio: string }>>();
  for (const detalle of detalles) {
    const list = serviciosPorCita.get(detalle.citaId) ?? [];
    list.push({ id: detalle.servicioId, nombre: detalle.nombre, precio: detalle.precio });
    serviciosPorCita.set(detalle.citaId, list);
  }
  const recursosPorCita = new Map<string, Array<{ id: string; nombre: string }>>();
  for (const detalle of detallesRecursos) {
    const list = recursosPorCita.get(detalle.citaId) ?? [];
    list.push({ id: detalle.recursoId, nombre: detalle.nombre });
    recursosPorCita.set(detalle.citaId, list);
  }
  const staffPorId = new Map(staffRows.map((staff) => [staff.id, staff.nombre]));

  // Alergias del expediente anexadas a las notas del cliente — solo si el
  // usuario puede verlas (`expedientes.alergias_ver`/`expedientes.privado`).
  const alergias = await alergiasPorCliente(
    getDatabase(),
    organization.id,
    [...new Set(citaRows.map((row) => row.clienteId).filter((id): id is string => Boolean(id)))],
    context.access,
  );

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
      clienteNotas: conAlergias(row.clienteNotas, row.clienteId ? alergias.get(row.clienteId) : undefined),
      sucursalId: row.sucursalId,
      usuarioId: row.usuarioId,
      usuarioNombre: row.usuarioId ? (staffPorId.get(row.usuarioId) ?? "Profesional") : null,
      version: row.version,
      ventaId: row.ventaId,
      servicios: serviciosPorCita.get(row.id) ?? [],
      recursos: recursosPorCita.get(row.id) ?? [],
    }))
    .filter((cita) => {
      if (!q) return true;
      const texto = [cita.clienteNombre, cita.usuarioNombre, cita.notas, cita.estado, ...cita.servicios.map((servicio) => servicio.nombre)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(q);
    });

  // El board solo pinta turnos/bloqueos activos; el panel de configuración
  // recibe la lista completa para poder reactivar.
  const horarios: AgendaHorario[] = horarioRows.filter((row) => row.activo);
  const bloqueos: AgendaBloqueo[] = bloqueoRows
    .filter(
      (row) =>
        row.activo &&
        row.iniciaAt < finBounds.iniciaAt &&
        row.terminaAt >= inicioBounds.iniciaAt,
    )
    .map((row) => ({
      id: row.id,
      usuarioId: row.usuarioId,
      iniciaAt: row.iniciaAt.toISOString(),
      terminaAt: row.terminaAt.toISOString(),
      tipo: row.tipo,
      motivo: row.motivo,
    }));
  const horariosConfig: HorarioConfig[] = horarioRows;
  const bloqueosConfig: BloqueoConfig[] = bloqueoRows.map((row) => ({
    id: row.id,
    usuarioId: row.usuarioId,
    usuarioNombre: row.usuarioId ? (staffPorId.get(row.usuarioId) ?? "Profesional") : null,
    iniciaAt: row.iniciaAt.toISOString(),
    terminaAt: row.terminaAt.toISOString(),
    tipo: row.tipo,
    motivo: row.motivo,
    activo: row.activo,
  }));
  const [sucursalRow] = await getDatabase()
    .select({ capacidadSinAsignar: sucursales.capacidadSinAsignar })
    .from(sucursales)
    .where(eq(sucursales.id, branch.id))
    .limit(1);
  const puedeEditar = hasPermission(context.access, "agenda.editar");
  const recursosConfig: RecursoConfig[] = recursoRows;
  const recursosActivos = recursoRows.filter((r) => r.activo);
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
      {puedeEditar ? (
        <DisponibilidadPanel
          bloqueos={bloqueosConfig}
          capacidadSinAsignar={sucursalRow?.capacidadSinAsignar ?? 1}
          horarios={horariosConfig}
          organizationId={organizationId ?? organization.id}
          recursos={recursosConfig}
          staff={staffRows}
          sucursalId={branch.id}
          timeZone={timeZone}
        />
      ) : null}
      <AgendaBoard
        bloqueos={bloqueos}
        citas={citasSerializadas}
        clientes={clientRows}
        currency={currency}
        fecha={fecha}
        horarios={horarios}
        organizationId={organizationId ?? organization.id}
        recursos={recursosActivos}
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
