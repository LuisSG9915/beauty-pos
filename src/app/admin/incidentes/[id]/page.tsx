import { notFound } from "next/navigation";

import { AdminCard, AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAdmin } from "@/lib/auth/access";
import {
  administradoresPlataforma,
  obtenerIncidente,
} from "@/modules/incidentes/queries";

import {
  IncidenteControles,
  IncidenteNota,
  IncidenteResolver,
} from "./incidente-acciones";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "../page";

export const dynamic = "force-dynamic";

const TIPO_HISTORIAL: Record<string, string> = {
  estado: "Estado",
  prioridad: "Prioridad",
  asignacion: "Responsable",
  nota: "Nota",
  reapertura: "Reapertura",
};

export default async function IncidenteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;

  const [datos, administradores] = await Promise.all([
    obtenerIncidente(id),
    administradoresPlataforma(),
  ]);
  if (!datos) notFound();

  const { incidente, ocurrencias, historial, porNavegador } = datos;
  const prioridad = PRIORIDAD_LABELS[incidente.prioridad] ?? PRIORIDAD_LABELS.p3;
  const estado = ESTADO_LABELS[incidente.estado] ?? ESTADO_LABELS.nuevo;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Panel", href: "/admin" },
          { label: "Incidentes", href: "/admin/incidentes" },
          { label: "Detalle" },
        ]}
        title={incidente.titulo}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AdminCard title="Detalle del error">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#8a7b72]">Estado</dt>
                <dd className="mt-1"><StatusBadge tone={estado.tone}>{estado.label}</StatusBadge></dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Prioridad</dt>
                <dd className="mt-1"><StatusBadge tone={prioridad.tone}>{prioridad.label}</StatusBadge></dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Fuente</dt>
                <dd className="mt-1">{incidente.fuente}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Módulo / ruta</dt>
                <dd className="mt-1">
                  {incidente.modulo ?? "—"} {incidente.ruta ? `· ${incidente.ruta}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Ocurrencias</dt>
                <dd className="mt-1 tabular-nums">{incidente.ocurrencias}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Negocios afectados</dt>
                <dd className="mt-1 tabular-nums">{incidente.organizacionesAfectadas}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Primera vez</dt>
                <dd className="mt-1">{formatDateTime(incidente.primeraVezAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#8a7b72]">Última vez</dt>
                <dd className="mt-1">{formatDateTime(incidente.ultimaVezAt)}</dd>
              </div>
              {incidente.releaseAparece ? (
                <div>
                  <dt className="text-xs text-[#8a7b72]">Apareció en</dt>
                  <dd className="mt-1">{incidente.releaseAparece}</dd>
                </div>
              ) : null}
              {incidente.releaseCorregido ? (
                <div>
                  <dt className="text-xs text-[#8a7b72]">Corregido en</dt>
                  <dd className="mt-1">{incidente.releaseCorregido}</dd>
                </div>
              ) : null}
            </dl>
            {incidente.mensaje ? (
              <pre className="mt-4 max-h-48 overflow-auto rounded-xl bg-[#faf6f3] p-4 text-xs leading-5 whitespace-pre-wrap text-[#403a35]">
                {incidente.mensaje}
              </pre>
            ) : null}
            {incidente.resueltoAt ? (
              <p className="mt-4 rounded-xl border border-[#cfe3d0] bg-[#eef6ee] px-4 py-3 text-sm text-[#3f6b45]">
                Resuelto por {incidente.resueltoNombre ?? "—"} el{" "}
                {formatDateTime(incidente.resueltoAt)}.
                {incidente.notaResolucion ? ` ${incidente.notaResolucion}` : ""}
              </p>
            ) : null}
          </AdminCard>

          <AdminCard title="Ocurrencias recientes">
            {ocurrencias.length === 0 ? (
              <p className="text-sm text-[#81746c]">Sin ocurrencias registradas.</p>
            ) : (
              <ul className="divide-y divide-[#f4eeea]">
                {ocurrencias.map((oc) => (
                  <li className="py-3" key={oc.id}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8a7b72]">
                      <span className="font-mono">{oc.correlationId}</span>
                      <span>{formatDateTime(oc.createdAt)}</span>
                      {oc.ruta ? <span>{oc.ruta}</span> : null}
                      {oc.navegador ? <span>{oc.navegador}</span> : null}
                      {oc.dispositivo ? <span>{oc.dispositivo}</span> : null}
                      {oc.organizacion ? <span>{oc.organizacion}</span> : null}
                    </div>
                    {typeof oc.contexto?.stack === "string" && oc.contexto.stack ? (
                      <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-[#faf6f3] p-3 text-[11px] leading-4 whitespace-pre-wrap text-[#625b55]">
                        {oc.contexto.stack}
                      </pre>
                    ) : null}
                    {Array.isArray(oc.contexto?.rastro) && oc.contexto.rastro.length > 0 ? (
                      <p className="mt-2 text-[11px] text-[#8a7b72]">
                        Acciones previas: {oc.contexto.rastro.join(" → ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        </div>

        <div className="space-y-6">
          <AdminCard title="Triage">
            <IncidenteControles
              administradores={administradores}
              asignadoA={incidente.asignadoA}
              estado={incidente.estado}
              incidenteId={incidente.id}
              prioridad={incidente.prioridad}
            />
          </AdminCard>

          <AdminCard title="Resolver">
            <IncidenteResolver incidenteId={incidente.id} />
          </AdminCard>

          <AdminCard title="Distribución por navegador">
            {porNavegador.length === 0 ? (
              <p className="text-sm text-[#81746c]">Sin datos.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {porNavegador.map((fila) => (
                  <li className="flex justify-between" key={fila.navegador ?? "desconocido"}>
                    <span>{fila.navegador ?? "desconocido"}</span>
                    <span className="tabular-nums">{fila.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          <AdminCard title="Notas e historial">
            <IncidenteNota incidenteId={incidente.id} />
            <ul className="mt-4 space-y-3">
              {historial.map((item) => (
                <li className="border-l-2 border-[#eadfd8] pl-3 text-sm" key={item.id}>
                  <p className="text-xs text-[#8a7b72]">
                    {formatDateTime(item.createdAt)} · {item.usuario ?? "Sistema"} ·{" "}
                    {TIPO_HISTORIAL[item.tipo] ?? item.tipo}
                    {item.valorAnterior || item.valorNuevo
                      ? ` · ${item.valorAnterior ?? "—"} → ${item.valorNuevo ?? "—"}`
                      : ""}
                  </p>
                  {item.comentario ? (
                    <p className="mt-1 text-[#403a35]">{item.comentario}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </div>

      <AdminSection />
    </div>
  );
}
