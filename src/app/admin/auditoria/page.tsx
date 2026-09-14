import { and, desc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { auditoriaEventos } from "@/db/schema/access";
import { sucursales, usuarios } from "@/db/schema/core";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatDate, formatTime } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const PAGE_SIZE = 50;

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "auditoria.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const desde = firstParam(params.desde) ?? "";
  const hasta = firstParam(params.hasta) ?? "";
  const accion = firstParam(params.accion) ?? "";
  const usuarioId = firstParam(params.usuarioId) ?? "";
  const page = Math.max(1, Number(firstParam(params.page) ?? "1") || 1);

  const conditions = [eq(auditoriaEventos.organizacionId, organizationId)];
  if (desde) conditions.push(gte(auditoriaEventos.createdAt, new Date(`${desde}T00:00:00`)));
  if (hasta) conditions.push(lt(auditoriaEventos.createdAt, new Date(`${hasta}T23:59:59.999`)));
  if (accion) conditions.push(eq(auditoriaEventos.accion, accion));
  if (usuarioId) conditions.push(eq(auditoriaEventos.usuarioId, usuarioId));

  const [eventos, usuariosRows, accionesRows] = await Promise.all([
    db
      .select({
        id: auditoriaEventos.id,
        accion: auditoriaEventos.accion,
        entidad: auditoriaEventos.entidad,
        entidadId: auditoriaEventos.entidadId,
        detalle: auditoriaEventos.detalle,
        createdAt: auditoriaEventos.createdAt,
        usuario: usuarios.nombre,
        sucursal: sucursales.nombre,
      })
      .from(auditoriaEventos)
      .leftJoin(usuarios, eq(auditoriaEventos.usuarioId, usuarios.id))
      .leftJoin(sucursales, eq(auditoriaEventos.sucursalId, sucursales.id))
      .where(and(...conditions))
      .orderBy(desc(auditoriaEventos.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(usuarios)
      .innerJoin(auditoriaEventos, eq(auditoriaEventos.usuarioId, usuarios.id))
      .where(eq(auditoriaEventos.organizacionId, organizationId))
      .groupBy(usuarios.id, usuarios.nombre)
      .orderBy(usuarios.nombre),
    db
      .select({ accion: auditoriaEventos.accion })
      .from(auditoriaEventos)
      .where(eq(auditoriaEventos.organizacionId, organizationId))
      .groupBy(auditoriaEventos.accion)
      .orderBy(auditoriaEventos.accion),
  ]);

  const hasMore = eventos.length > PAGE_SIZE;
  const pageRows = eventos.slice(0, PAGE_SIZE);
  const baseParams = { organizationId, extra: { desde, hasta, accion, usuarioId } };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Bitácora de eventos sensibles: quién hizo qué, dónde y cuándo."
        title="Auditoría"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-40">
          <FieldLabel>Desde</FieldLabel>
          <Input defaultValue={desde} name="desde" type="date" />
        </Field>
        <Field className="w-40">
          <FieldLabel>Hasta</FieldLabel>
          <Input defaultValue={hasta} name="hasta" type="date" />
        </Field>
        <Field className="w-52">
          <FieldLabel>Acción</FieldLabel>
          <select
            className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm text-[#403a35]"
            defaultValue={accion}
            name="accion"
          >
            <option value="">Todas</option>
            {accionesRows.map((row) => (
              <option key={row.accion} value={row.accion}>{row.accion}</option>
            ))}
          </select>
        </Field>
        <Field className="w-52">
          <FieldLabel>Usuario</FieldLabel>
          <select
            className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm text-[#403a35]"
            defaultValue={usuarioId}
            name="usuarioId"
          >
            <option value="">Todos</option>
            {usuariosRows.map((row) => (
              <option key={row.id} value={row.id}>{row.nombre}</option>
            ))}
          </select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
      </form>

      {pageRows.length === 0 ? (
        <EmptyState description="No hay eventos registrados con esos filtros." title="Sin eventos" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#eadfd8] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eee6e0] bg-[#faf6f3] text-left text-xs uppercase tracking-wide text-[#8a7b72]">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Acción</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Sucursal</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((evento) => (
                <tr className="border-b border-[#f4eeea] last:border-0" key={evento.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-[#625b55]">
                    {formatDate(evento.createdAt)} <span className="text-[#a99d94]">{formatTime(evento.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2d2926]">{evento.usuario ?? "Sistema"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#f1eeea] px-2.5 py-1 text-xs font-medium text-[#60392e]">
                      {evento.accion}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-[#625b55] md:table-cell">{evento.sucursal ?? "—"}</td>
                  <td className="hidden max-w-72 px-4 py-3 lg:table-cell">
                    <span className="block truncate text-xs text-[#81746c]" title={evento.detalle ? JSON.stringify(evento.detalle) : undefined}>
                      {evento.detalle ? JSON.stringify(evento.detalle) : evento.entidad ? `${evento.entidad} ${evento.entidadId ?? ""}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[#81746c]">Página {page}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/auditoria", { ...baseParams, extra: { ...baseParams.extra, page: String(page - 1) } })} />} variant="outline">
              ← Anterior
            </Button>
          ) : null}
          {hasMore ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/auditoria", { ...baseParams, extra: { ...baseParams.extra, page: String(page + 1) } })} />} variant="outline">
              Siguiente →
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
