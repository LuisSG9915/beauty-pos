import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import type { AdminSearchParams } from "@/lib/admin-context";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { firstParam } from "@/lib/url-context";
import { listarIncidentes } from "@/modules/incidentes/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export const PRIORIDAD_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  p0: { label: "P0 · Crítica", tone: "destructive" },
  p1: { label: "P1 · Alta", tone: "warning" },
  p2: { label: "P2 · Media", tone: "info" },
  p3: { label: "P3 · Baja", tone: "neutral" },
};

export const ESTADO_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  nuevo: { label: "Nuevo", tone: "destructive" },
  en_revision: { label: "En revisión", tone: "warning" },
  en_progreso: { label: "En progreso", tone: "info" },
  resuelto: { label: "Resuelto", tone: "success" },
  ignorado: { label: "Ignorado", tone: "neutral" },
};

const FUENTE_LABELS: Record<string, string> = {
  client: "Navegador",
  server: "Servidor",
  server_action: "Acción servidor",
  worker: "Worker",
};

export default async function IncidentesPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;

  const filtros = {
    estado: firstParam(params.estado) ?? "abiertos",
    prioridad: firstParam(params.prioridad) ?? "",
    modulo: firstParam(params.modulo) ?? "",
    q: firstParam(params.q) ?? "",
    desde: firstParam(params.desde) ?? "",
    hasta: firstParam(params.hasta) ?? "",
  };
  const page = Math.max(1, Number(firstParam(params.page) ?? "1") || 1);

  const rows = await listarIncidentes(filtros, page, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  const incidentes = rows.slice(0, PAGE_SIZE);

  const queryBase = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) queryBase.set(k, v);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Panel", href: "/admin" }, { label: "Incidentes" }]}
        description="Errores de la aplicación agrupados por causa, con prioridad y seguimiento de resolución. Solo visible para la plataforma."
        title="Incidentes de error"
      />

      <AdminCard title="Filtros">
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <Field>
            <FieldLabel htmlFor="estado">Estado</FieldLabel>
            <Select defaultValue={filtros.estado} id="estado" name="estado">
              <option value="abiertos">Abiertos</option>
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABELS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="prioridad">Prioridad</FieldLabel>
            <Select defaultValue={filtros.prioridad} id="prioridad" name="prioridad">
              <option value="">Todas</option>
              {Object.entries(PRIORIDAD_LABELS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="modulo">Módulo</FieldLabel>
            <Select defaultValue={filtros.modulo} id="modulo" name="modulo">
              <option value="">Todos</option>
              {["agenda", "pos", "caja", "clientes", "inventario", "reservas", "auth", "admin", "otro"].map(
                (modulo) => (
                  <option key={modulo} value={modulo}>
                    {modulo}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="desde">Desde</FieldLabel>
            <Input defaultValue={filtros.desde} id="desde" name="desde" type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor="hasta">Hasta</FieldLabel>
            <Input defaultValue={filtros.hasta} id="hasta" name="hasta" type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor="q">Buscar</FieldLabel>
            <Input defaultValue={filtros.q} id="q" name="q" placeholder="Texto del error" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-6">
            <Button className="min-h-10 rounded-xl" data-action-clave="1" data-action-id="incidentes.filtro.aplicar" type="submit">
              Filtrar
            </Button>
          </div>
        </form>
      </AdminCard>

      {incidentes.length === 0 ? (
        <EmptyState
          description="No hay incidentes que coincidan con los filtros seleccionados."
          icon={AlertTriangle}
          title="Sin incidentes"
        />
      ) : (
        <AdminCard className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-op-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Prioridad</th>
                <th className="px-5 py-3 font-medium">Error</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Veces</th>
                <th className="px-5 py-3 font-medium">Negocios</th>
                <th className="px-5 py-3 font-medium">Última vez</th>
                <th className="px-5 py-3 font-medium">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {incidentes.map((incidente) => {
                const prioridad = PRIORIDAD_LABELS[incidente.prioridad] ?? PRIORIDAD_LABELS.p3;
                const estado = ESTADO_LABELS[incidente.estado] ?? ESTADO_LABELS.nuevo;
                return (
                  <tr
                    className="border-b border-border last:border-0 hover:bg-muted/60"
                    key={incidente.id}
                  >
                    <td className="px-5 py-3">
                      <StatusBadge tone={prioridad.tone}>{prioridad.label}</StatusBadge>
                    </td>
                    <td className="max-w-md px-5 py-3">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/admin/incidentes/${incidente.id}`}
                      >
                        {incidente.titulo}
                      </Link>
                      <p className="mt-0.5 truncate text-op-xs text-muted-foreground">
                        {FUENTE_LABELS[incidente.fuente] ?? incidente.fuente}
                        {incidente.modulo ? ` · ${incidente.modulo}` : ""}
                        {incidente.ruta ? ` · ${incidente.ruta}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{incidente.ocurrencias}</td>
                    <td className="px-5 py-3 tabular-nums">
                      {incidente.organizacionesAfectadas}
                    </td>
                    <td className="px-5 py-3 text-op-xs text-muted-foreground">
                      {formatDateTime(incidente.ultimaVezAt)}
                    </td>
                    <td className="px-5 py-3 text-op-xs text-muted-foreground">
                      {incidente.asignadoNombre ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminCard>
      )}

      <div className="flex items-center justify-between">
        {page > 1 ? (
          <Link
            className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60"
            href={`/admin/incidentes?${queryBase}&page=${page - 1}`}
          >
            ← Anterior
          </Link>
        ) : (
          <span />
        )}
        {hasMore ? (
          <Link
            className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60"
            href={`/admin/incidentes?${queryBase}&page=${page + 1}`}
          >
            Siguiente →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
