import { sql } from "drizzle-orm";
import Link from "next/link";

import { MiDiaBoard, type MiDiaCita } from "@/app/admin/mi-dia/mi-dia-board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { GLOSARIO } from "@/lib/glosario";
import { buildAdminHref } from "@/lib/url-context";
import { dayBoundsUtc } from "@/modules/agenda";
import { conAlergias } from "@/modules/expedientes/alergias";

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
          description="Tu cuenta no tiene un negocio activo asignado."
          title="Sin negocio"
        />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description={organization.nombre}
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
        <AdminPageHeader description={branch.nombre} title="Mi día" />
        <EmptyState description="No se pudo resolver el día actual." title="Fecha inválida" />
      </div>
    );
  }

  const db = getDatabase();
  const puedeVerAlergias = hasPermission(context.access, "expedientes.alergias_ver");
  const puedeAlergiaPrivada = hasPermission(context.access, "expedientes.privado");

  // Una sola ronda SQL: citas del día del usuario con sus servicios y alergias
  // anidados en jsonb + totales de propinas y comisiones como subselects
  // escalares. Antes eran 5 consultas en 2 rondas; cada una abría una
  // conexión fría al pool (~60 ms handshake + ~100 ms RT). El gate de
  // expedientes.alergias_ver/privado se evalúa aquí, no en la BD.
  type MiDiaRow = {
    citas: Array<{
      id: string;
      fechaHora: string;
      duracionMinutos: number;
      estado: string;
      notas: string | null;
      totalEstimado: string;
      version: number;
      clienteId: string | null;
      clienteNombre: string | null;
      clienteNotas: string | null;
      ventaId: string | null;
      ventaEstado: string | null;
      servicios: string[];
      alergias: string | null;
    }>;
    propinasTotal: string;
    comisionesTotal: string;
  };
  const result = await db.execute<MiDiaRow>(sql`
    select
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', c.id,
            'fechaHora', to_char(c.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'duracionMinutos', c.duracion_minutos,
            'estado', c.estado,
            'notas', c.notas,
            'totalEstimado', c.total_estimado::text,
            'version', c.version,
            'clienteId', c.cliente_id,
            'clienteNombre', cl.nombre,
            'clienteNotas', cl.notas_operativas,
            'ventaId', v.id,
            'ventaEstado', v.estado,
            'servicios', coalesce((
              select jsonb_agg(s.nombre)
                from detalle_citas_servicios dcs
                join servicios s on dcs.servicio_id = s.id
               where dcs.cita_id = c.id and dcs.activo
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
         where c.organizacion_id = ${organization.id}
           and c.sucursal_id = ${branch.id}
           and c.usuario_id = ${user.id}
           and c.activo
           and c.fecha_hora >= ${bounds.iniciaAt}
           and c.fecha_hora < ${bounds.terminaAt}
      ), '[]'::jsonb) as citas,
      (select coalesce(sum(dvp.monto), 0)::text
        from detalle_ventas_propinas dvp
        join ventas v on dvp.venta_id = v.id
       where dvp.usuario_id = ${user.id} and dvp.activo
         and v.organizacion_id = ${organization.id}
         and v.sucursal_id = ${branch.id}
         and v.activo
         and coalesce(v.cobrada_at, v.created_at) >= ${bounds.iniciaAt}
         and coalesce(v.cobrada_at, v.created_at) < ${bounds.terminaAt}
      ) as "propinasTotal",
      (select coalesce(sum(dvc.monto), 0)::text
        from detalle_ventas_comisiones dvc
        join ventas v on dvc.venta_id = v.id
       where dvc.usuario_id = ${user.id} and dvc.activo
         and v.organizacion_id = ${organization.id}
         and v.sucursal_id = ${branch.id}
         and v.activo
         and coalesce(v.cobrada_at, v.created_at) >= ${bounds.iniciaAt}
         and coalesce(v.cobrada_at, v.created_at) < ${bounds.terminaAt}
      ) as "comisionesTotal"
  `);

  const citaRows = result.rows[0]?.citas ?? [];

  const propinas = Number(result.rows[0]?.propinasTotal ?? 0);
  const comisiones = Number(result.rows[0]?.comisionesTotal ?? 0);

  const citasSerializadas: MiDiaCita[] = citaRows.map(({ alergias, ...row }) => ({
    ...row,
    clienteNombre: row.clienteNombre ?? GLOSARIO.clienteDePaso,
    clienteNotas: conAlergias(row.clienteNotas, alergias ?? undefined),
  }));

  // Cuando hay citas operables, la acción primaria la marca el board (la
  // siguiente cita del profesional); si no, la lleva "Ver agenda".
  const hayAccionable = citasSerializadas.some((c) =>
    ["pendiente", "confirmada", "en_proceso"].includes(c.estado),
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button
            data-action-clave={hayAccionable ? undefined : "1"}
            data-action-id="mi_dia.agenda.abrir"
            nativeButton={false}
            render={<Link href={buildAdminHref("/agenda", { organizationId: organization.id, sucursalId: branch.id })} />}
            size="lg"
            variant="outline"
          >
            Ver agenda
          </Button>
        }
        description={branch.nombre}
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
