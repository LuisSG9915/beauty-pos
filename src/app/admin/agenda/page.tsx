import { and, desc, eq, sql } from "drizzle-orm";

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
import { clientes } from "@/db/schema/core";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { firstParam, normalizeDateInput, normalizeView } from "@/lib/url-context";
import { dayBoundsUtc, shiftDateKey, weekStartDateKey } from "@/modules/agenda";
import { contextoSuscripcionCache } from "@/modules/billing/queries";
import { conAlergias } from "@/modules/expedientes/alergias";
import type { AvisoReciente } from "@/modules/notificaciones/service";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
  fecha?: string | string[];
  vista?: string | string[];
  q?: string | string[];
}>;

const AGENDA_VIEWS = ["dia", "semana", "lista"] as const;

type CitaRow = Omit<AgendaCita, "usuarioNombre" | "clienteNotas" | "fechaHora"> & {
  fechaHora: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  clienteNotas: string | null;
  alergias: string | null;
};

type AgendaDatosRow = {
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; categoriaId: string | null; precioBase: string; duracionMinutos: number; imagenClaveR2: string | null }>;
  horarios: HorarioConfig[];
  bloqueos: Array<{
    id: string;
    usuarioId: string | null;
    iniciaAt: string;
    terminaAt: string;
    tipo: string;
    motivo: string | null;
    activo: boolean;
  }>;
  recursos: RecursoConfig[];
  citas: CitaRow[];
  avisos: AvisoReciente[];
};

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, timeZone, currency } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description="Administra citas, profesionales y ventas por sucursal."
          title="Agenda de citas"
        />
        <EmptyState
          description="Tu cuenta no tiene un negocio activo asignado."
          title="Sin negocio"
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

  const puedeEditar = hasPermission(context.access, "agenda.editar");
  const puedeVerAlergias = hasPermission(context.access, "expedientes.alergias_ver");
  const puedeAlergiaPrivada = hasPermission(context.access, "expedientes.privado");
  // El panel solo administra bloqueos vigentes/recientes; el historial remoto
  // no aporta y encarece cada navegación.
  const bloqueosDesde = new Date(inicioBounds.iniciaAt.getTime() - 30 * 86_400_000);

  // Toda la página en UNA consulta: cada lista viaja como jsonb. Las consultas
  // paralelas de antes obligaban a abrir varias conexiones frías por request y
  // cada ronda a la BD remota cuesta ~50-100 ms. Fechas en ISO UTC para
  // serializar directo a los componentes.
  const [datosResult, suscripcion, clientesIniciales] = await Promise.all([
    getDatabase().execute<AgendaDatosRow>(sql`
      select
        coalesce((
          select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
            from rel_usuarios_sucursales rus
            join usuarios u on rus.usuario_id = u.id
            join miembros_organizaciones mo on mo.usuario_id = u.id
              and mo.organizacion_id = ${organization.id} and mo.estado = 'activo'
           where rus.organizacion_id = ${organization.id}
             and rus.sucursal_id = ${branch.id}
             and u.activo
        ), '[]'::jsonb) as staff,
        coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', s.id, 'nombre', s.nombre, 'categoriaId', s.categoria_id,
              'precioBase', s.precio_base::text, 'duracionMinutos', s.duracion_minutos,
              'imagenClaveR2', m.clave_r2
            ) order by s.nombre)
            from servicios s
            left join medios m on m.id = s.imagen_principal_id
           where s.organizacion_id = ${organization.id} and s.activo
        ), '[]'::jsonb) as servicios,
        coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', h.id, 'diaSemana', h.dia_semana, 'iniciaMinutos', h.inicia_minutos,
              'terminaMinutos', h.termina_minutos, 'activo', h.activo
            ) order by h.dia_semana, h.inicia_minutos)
            from horarios_sucursales h
           where h.organizacion_id = ${organization.id} and h.sucursal_id = ${branch.id}
        ), '[]'::jsonb) as horarios,
        coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', b.id, 'usuarioId', b.usuario_id,
              'iniciaAt', to_char(b.inicia_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'terminaAt', to_char(b.termina_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'tipo', b.tipo, 'motivo', b.motivo, 'activo', b.activo
            ) order by b.inicia_at)
            from bloqueos_agenda b
           where b.organizacion_id = ${organization.id} and b.sucursal_id = ${branch.id}
             and b.termina_at >= ${bloqueosDesde}
        ), '[]'::jsonb) as bloqueos,
        coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', r.id, 'nombre', r.nombre, 'tipo', r.tipo,
              'capacidad', r.capacidad, 'activo', r.activo,
              -- Mueble del plano enlazado a este recurso (plan 11); null si no hay.
              'muebleNombre', (select m.nombre from mobiliario m
                 where m.recurso_id = r.id and m.activo limit 1)
            ) order by r.nombre)
            from recursos r
           where r.organizacion_id = ${organization.id} and r.sucursal_id = ${branch.id}
        ), '[]'::jsonb) as recursos,
        coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', c.id,
              'fechaHora', to_char(c.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'duracionMinutos', c.duracion_minutos,
              'estado', c.estado, 'notas', c.notas,
              'totalEstimado', c.total_estimado::text,
              'clienteId', c.cliente_id,
              'clienteNombre', trim(concat_ws(' ', cl.nombre, cl.apellido_paterno, cl.apellido_materno)),
              'clienteTelefono', cl.telefono,
              'clienteNotas', cl.notas_operativas,
              'sucursalId', c.sucursal_id,
              'usuarioId', c.usuario_id,
              'version', c.version,
              'ventaId', v.id,
              'servicios', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', s2.id, 'nombre', s2.nombre, 'categoriaId', s2.categoria_id,
                    'precio', d.precio::text, 'imagenClaveR2', m2.clave_r2))
                  from detalle_citas_servicios d
                  join servicios s2 on d.servicio_id = s2.id
                  left join medios m2 on m2.id = s2.imagen_principal_id
                 where d.cita_id = c.id and d.activo
              ), '[]'::jsonb),
              'recursos', coalesce((
                select jsonb_agg(jsonb_build_object('id', r2.id, 'nombre', r2.nombre))
                  from cita_recursos cr
                  join recursos r2 on cr.recurso_id = r2.id
                 where cr.cita_id = c.id and cr.activo
              ), '[]'::jsonb),
              'alergias', case when ${puedeVerAlergias} then (
                select string_agg(coalesce(f.notas, f.formula), ' · ')
                  from clientes_fichas_tecnicas f
                 where f.organizacion_id = ${organization.id} and f.tipo = 'alergia'
                   and f.activo and f.cliente_id = c.cliente_id
                   and (not f.privada or ${puedeAlergiaPrivada})
              ) end
            ) order by c.fecha_hora)
            from citas c
            left join clientes cl on c.cliente_id = cl.id
            left join ventas v on v.cita_id = c.id and v.activo
           where c.organizacion_id = ${organization.id} and c.sucursal_id = ${branch.id}
             and c.activo
             and c.fecha_hora >= ${inicioBounds.iniciaAt}
             and c.fecha_hora < ${finBounds.iniciaAt}
        ), '[]'::jsonb) as citas,
        case when ${puedeEditar} then coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', n.id, 'tipo', n.tipo, 'correoDestino', n.correo_destino,
              'estado', n.estado, 'intentos', n.intentos,
              'programadoPara', to_char(n.programado_para at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'enviadoAt', case when n.enviado_at is null then null
                else to_char(n.enviado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
              'proveedorId', n.proveedor_id, 'error', n.error,
              'citaFechaHora', case when cn.fecha_hora is null then null
                else to_char(cn.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
            ))
            from (
              select * from notificaciones_envios
               where organizacion_id = ${organization.id}
               order by created_at desc limit 12
            ) n
            left join citas cn on n.cita_id = cn.id
        ), '[]'::jsonb) else '[]'::jsonb end as avisos
    `),
    contextoSuscripcionCache(organization.id),
    getDatabase()
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        telefono: clientes.telefono,
      })
      .from(clientes)
      .where(and(eq(clientes.organizacionId, organization.id), eq(clientes.activo, true)))
      .orderBy(desc(clientes.creadoEn))
      .limit(100),
  ]);
  const datos = datosResult.rows[0];
  const staffRows = datos?.staff ?? [];
  const serviceRows = datos?.servicios ?? [];
  const horarioRows = datos?.horarios ?? [];
  const bloqueoRows = datos?.bloqueos ?? [];
  const recursoRows = datos?.recursos ?? [];
  const citaRows = datos?.citas ?? [];
  const avisos: AvisoReciente[] = datos?.avisos ?? [];

  const staffPorId = new Map(staffRows.map((staff) => [staff.id, staff.nombre]));

  const citasSerializadas: AgendaCita[] = citaRows
    .map((row) => ({
      id: row.id,
      fechaHora: row.fechaHora,
      duracionMinutos: row.duracionMinutos,
      estado: row.estado,
      notas: row.notas,
      totalEstimado: row.totalEstimado,
      clienteId: row.clienteId,
      clienteNombre: row.clienteNombre ?? "Cliente de paso",
      clienteTelefono: row.clienteTelefono,
      clienteNotas: conAlergias(row.clienteNotas, row.alergias ?? undefined),
      sucursalId: row.sucursalId,
      usuarioId: row.usuarioId,
      usuarioNombre: row.usuarioId ? (staffPorId.get(row.usuarioId) ?? "Profesional") : null,
      version: row.version,
      ventaId: row.ventaId,
      servicios: row.servicios,
      recursos: row.recursos,
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
        new Date(row.iniciaAt) < finBounds.iniciaAt &&
        new Date(row.terminaAt) >= inicioBounds.iniciaAt,
    )
    .map((row) => ({
      id: row.id,
      usuarioId: row.usuarioId,
      iniciaAt: row.iniciaAt,
      terminaAt: row.terminaAt,
      tipo: row.tipo,
      motivo: row.motivo,
    }));
  const horariosConfig: HorarioConfig[] = horarioRows;
  const bloqueosConfig: BloqueoConfig[] = bloqueoRows.map((row) => ({
    id: row.id,
    usuarioId: row.usuarioId,
    usuarioNombre: row.usuarioId ? (staffPorId.get(row.usuarioId) ?? "Profesional") : null,
    iniciaAt: row.iniciaAt,
    terminaAt: row.terminaAt,
    tipo: row.tipo,
    motivo: row.motivo,
    activo: row.activo,
  }));
  const recursosConfig: RecursoConfig[] = recursoRows;
  const recursosActivos = recursoRows.filter((r) => r.activo);
  const weekDays = vista === "semana"
    ? Array.from({ length: 7 }, (_, index) => shiftDateKey(inicioSemana, index) ?? inicioSemana)
    : [fecha];

  return (
    <div className="space-y-2.5 sm:space-y-4">
      <div className="hidden md:block">
        <AdminPageHeader description={branch.nombre} title="Agenda" />
      </div>
      <AgendaToolbar
        action={
          puedeEditar ? (
            <DisponibilidadPanel
              avisos={avisos}
              bloqueos={bloqueosConfig}
              capacidadSinAsignar={branch.capacidadSinAsignar}
              horarios={horariosConfig}
              organizacionSlug={organization.slug}
              organizationId={organizationId ?? organization.id}
              permiteAutoConfirmar={suscripcion.capacidades.has("reservas_auto_confirmar")}
              permiteRecordatorios={suscripcion.capacidades.has("recordatorios_email")}
              permiteReservasOnline={suscripcion.capacidades.has("reservas_online")}
              recordatoriosActivos={organization.recordatoriosActivos}
              recordatoriosHorasAntes={organization.recordatoriosHorasAntes}
              recursos={recursosConfig}
              reservasAnticipacionMinutos={branch.reservasAnticipacionMinutos}
              reservasAutoConfirmar={branch.reservasAutoConfirmar}
              reservasCancelacionHoras={branch.reservasCancelacionHoras}
              reservasHorizonteDias={branch.reservasHorizonteDias}
              reservasOnline={branch.reservasOnline}
              staff={staffRows}
              sucursalId={branch.id}
              timeZone={timeZone}
            />
          ) : null
        }
        fecha={fecha}
        hoy={todayDateInput(timeZone)}
        q={q}
        vista={vista}
      />
      <AgendaBoard
        bloqueos={bloqueos}
        citas={citasSerializadas}
        clientes={clientesIniciales}
        currency={currency}
        fecha={fecha}
        horarios={horarios}
        hoy={todayDateInput(timeZone)}
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
