import { sql } from "drizzle-orm";
import { Calendar, CalendarHeart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CitaStatusBadge } from "@/app/admin/agenda/cita-side-panel";
import { toggleConsentimientoActivo, toggleFichaTecnicaActiva } from "@/app/admin/client-actions";
import { ConsentimientoForm } from "@/app/admin/clientes/consentimiento-form";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { AntesDespuesSlider } from "@/components/antes-despues-slider";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { FormTabs } from "@/components/form-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import type { FichaFotoDetalle, FichaInsumo } from "@/db/schema/operations";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { calcularRetencionSugerida } from "@/modules/expedientes/retencion";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string | string[]; sucursalId?: string | string[] }>;
};

const TIPO_LABEL: Record<string, string> = {
  color: "Color",
  tratamiento: "Tratamiento",
  alergia: "Alergia",
  nota: "Nota",
};

// Expediente monocromático: los tipos son etiquetas neutras; solo la alergia
// usa color porque es una advertencia real de seguridad.
const TIPO_TONE: Record<string, string> = {
  color: "bg-muted/60 text-muted-foreground",
  tratamiento: "bg-muted/60 text-muted-foreground",
  alergia: "bg-destructive-soft text-destructive-soft-foreground",
  nota: "bg-muted/60 text-muted-foreground",
};

/** Expediente del cliente: datos, historial de citas/ventas y ficha técnica. */
export default async function ClienteDetallePage({ params, searchParams }: Props) {
  const { id } = await params;
  const context = await getAdminContext(await searchParams);
  const { organization, timeZone, currency } = context;

  if (!organization) notFound();
  requireAccessPermission(context.access, "clientes.ver");
  const puedePrivado = hasPermission(context.access, "expedientes.privado");
  const puedeAlergias = hasPermission(context.access, "expedientes.alergias_ver");

  const db = getDatabase();

  // El contenido sensible se excluye a nivel de consulta: las entradas
  // privadas requieren `expedientes.privado` y las alergias
  // `expedientes.alergias_ver`. Es exactamente el mismo predicado que antes,
  // ahora evaluado dentro del SQL fusionado.
  const fichaFilter =
    !puedePrivado && !puedeAlergias
      ? sql` and not f.privada and f.tipo <> 'alergia'`
      : !puedePrivado
        ? sql` and not f.privada`
        : !puedeAlergias
          ? sql` and (f.privada or f.tipo <> 'alergia')`
          : sql``;

  type ClienteJson = {
    id: string;
    nombre: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    telefono: string | null;
    correo: string | null;
    notas_operativas: string | null;
    rfc: string | null;
    regimen_fiscal: string | null;
  };
  type CitaExpediente = {
    id: string;
    fechaHora: string;
    estado: string;
    total: string;
    notas: string | null;
    ventaId: string | null;
  };
  type VentaExpediente = { id: string; fecha: string; estado: string; total: string; propina: string };
  type FichaExpediente = {
    id: string;
    tipo: string;
    formula: string | null;
    insumos: FichaInsumo[];
    tiempoPoseMinutos: number | null;
    notas: string | null;
    privada: boolean;
    fotos: string[];
    fotosDetalle: FichaFotoDetalle[];
    createdAt: string;
    servicioNombre: string | null;
    autorNombre: string | null;
  };
  type ConsentimientoExpediente = {
    id: string;
    titulo: string;
    contenido: string;
    firmadoPor: string | null;
    respuesta: string;
    createdAt: string;
    servicioNombre: string | null;
    autorNombre: string | null;
  };
  type ExpedienteRow = {
    cliente: ClienteJson | null;
    citas: CitaExpediente[];
    ventas: VentaExpediente[];
    fichas: FichaExpediente[];
    consentimientos: ConsentimientoExpediente[];
  };

  // Una sola ronda: la ficha del cliente + sus historiales como subselects
  // jsonb (antes eran 5 consultas repartidas en 2 rondas secuenciales). El
  // `ventaId` por cita sale de `ventas_cita_idx` vía join lateral limitado a 1.
  const { rows } = await db.execute<ExpedienteRow>(sql`
    select
      to_jsonb(c) as cliente,
      coalesce((
        select jsonb_agg(t) from (
          select
            ci.id,
            to_char(ci.fecha_hora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "fechaHora",
            ci.estado,
            ci.total_estimado::text as total,
            ci.notas,
            vv.venta_id as "ventaId"
          from citas ci
          left join lateral (
            select v.id as venta_id from ventas v
             where v.cita_id = ci.id and v.activo and v.estado = 'completada'
             order by v.cobrada_at desc nulls last
             limit 1
          ) vv on true
          where ci.cliente_id = c.id and ci.organizacion_id = ${organization.id} and ci.activo
          order by ci.fecha_hora desc
          limit 50
        ) t
      ), '[]'::jsonb) as citas,
      coalesce((
        select jsonb_agg(t) from (
          select
            v.id,
            to_char(coalesce(v.cobrada_at, v.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as fecha,
            v.estado,
            v.total::text as total,
            v.propina::text as propina
          from ventas v
          where v.cliente_id = c.id and v.organizacion_id = ${organization.id} and v.activo
          order by coalesce(v.cobrada_at, v.created_at) desc
          limit 50
        ) t
      ), '[]'::jsonb) as ventas,
      coalesce((
        select jsonb_agg(t) from (
          select
            f.id,
            f.tipo,
            f.formula,
            f.insumos,
            f.tiempo_pose_minutos as "tiempoPoseMinutos",
            f.notas,
            f.privada,
            f.fotos,
            f.fotos_detalle as "fotosDetalle",
            to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            s.nombre as "servicioNombre",
            u.nombre as "autorNombre"
          from clientes_fichas_tecnicas f
          left join servicios s on s.id = f.servicio_id
          left join usuarios u on u.id = f.usuario_id
          where f.cliente_id = c.id and f.organizacion_id = ${organization.id} and f.activo
            ${fichaFilter}
          order by f.created_at desc
        ) t
      ), '[]'::jsonb) as fichas,
      coalesce((
        select jsonb_agg(t) from (
          select
            co.id,
            co.titulo,
            co.contenido,
            co.firmado_por as "firmadoPor",
            co.respuesta,
            to_char(co.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
            s.nombre as "servicioNombre",
            u.nombre as "autorNombre"
          from clientes_consentimientos co
          left join servicios s on s.id = co.servicio_id
          left join usuarios u on u.id = co.usuario_id
          where co.cliente_id = c.id and co.organizacion_id = ${organization.id} and co.activo
          order by co.created_at desc
        ) t
      ), '[]'::jsonb) as consentimientos
    from clientes c
    where c.id = ${id} and c.organizacion_id = ${organization.id} and c.activo
    limit 1
  `);

  const row = rows[0];
  if (!row?.cliente) notFound();

  const cliente = {
    id: row.cliente.id,
    nombre: row.cliente.nombre,
    apellidoPaterno: row.cliente.apellido_paterno,
    apellidoMaterno: row.cliente.apellido_materno,
    telefono: row.cliente.telefono,
    correo: row.cliente.correo,
    notasOperativas: row.cliente.notas_operativas,
    rfc: row.cliente.rfc,
    regimenFiscal: row.cliente.regimen_fiscal,
  };
  const citaRows = row.citas ?? [];
  const ventaRows = row.ventas ?? [];
  const fichaRows = row.fichas ?? [];
  const consentRows = row.consentimientos ?? [];

  const nombreCompleto =
    [cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(" ") ||
    cliente.nombre;
  const fichasPorTipo = (tipos: string[]) => fichaRows.filter((ficha) => tipos.includes(ficha.tipo));

  const datosTab = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {[
        ["Nombre", nombreCompleto],
        ["Teléfono", cliente.telefono],
        ["Correo", cliente.correo],
        ["Notas operativas", cliente.notasOperativas],
        ["RFC", cliente.rfc],
        ["Régimen fiscal", cliente.regimenFiscal],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-op-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );

  const historialTab = (
    <div className="space-y-6">
      <section>
        <h3 className="text-op-xs font-semibold uppercase tracking-wide text-muted-foreground">Citas</h3>
        {citaRows.length === 0 ? (
          <EmptyState
            className="mt-3 px-4 py-6"
            description="Las citas que agendes para este cliente aparecerán aquí."
            title="Sin citas registradas"
          />
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {citaRows.map((cita) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={cita.id}>
                <span className="tabular-nums text-muted-foreground">
                  {formatDate(cita.fechaHora, { timeZone })} · {formatTime(cita.fechaHora, { timeZone })}
                </span>
                <CitaStatusBadge estado={cita.estado} ventaId={cita.ventaId} />
                <span className="font-semibold tabular-nums">{formatCurrency(cita.total, { currency })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-op-xs font-semibold uppercase tracking-wide text-muted-foreground">Ventas</h3>
        {ventaRows.length === 0 ? (
          <EmptyState
            className="mt-3 px-4 py-6"
            description="Los cobros ligados a este cliente aparecerán aquí."
            title="Sin ventas registradas"
          />
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {ventaRows.map((venta) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={venta.id}>
                <span className="tabular-nums text-muted-foreground">{formatDate(venta.fecha, { timeZone })}</span>
                <StatusBadge
                  tone={
                    venta.estado === "en_proceso"
                      ? "warning"
                      : venta.estado === "cancelada"
                        ? "destructive"
                        : "success"
                  }
                >
                  {venta.estado === "en_proceso" ? "En proceso" : venta.estado === "cancelada" ? "Cancelada" : "Completada"}
                </StatusBadge>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(venta.total, { currency })}
                  {Number(venta.propina) > 0 ? ` (+${formatCurrency(venta.propina, { currency })} prop.)` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const fichaList = (rows: typeof fichaRows, vacioTitulo: string, vacioDescripcion: string) =>
    rows.length === 0 ? (
      <EmptyState className="px-4 py-6" description={vacioDescripcion} title={vacioTitulo} />
    ) : (
      <ul className="space-y-3">
        {rows.map((ficha) => (
          <li className="rounded-xl border border-border px-4 py-3" key={ficha.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-op-xs font-semibold ${TIPO_TONE[ficha.tipo] ?? TIPO_TONE.nota}`}>
                {TIPO_LABEL[ficha.tipo] ?? ficha.tipo}
              </span>
              {ficha.privada ? (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-op-xs font-semibold text-muted-foreground">Privada</span>
              ) : null}
              {ficha.tiempoPoseMinutos != null ? (
                <span className="text-op-xs font-medium text-warning">Pose {ficha.tiempoPoseMinutos} min</span>
              ) : null}
              {ficha.servicioNombre ? (
                <span className="text-op-xs text-muted-foreground">· {ficha.servicioNombre}</span>
              ) : null}
              <span className="ml-auto text-op-xs tabular-nums text-muted-foreground">
                {formatDate(ficha.createdAt, { timeZone })}
                {ficha.autorNombre ? ` · ${ficha.autorNombre}` : ""}
              </span>
              <form action={toggleFichaTecnicaActiva}>
                <input name="organizacionId" type="hidden" value={organization.id} />
                <input name="id" type="hidden" value={ficha.id} />
                <input name="activo" type="hidden" value="true" />
                <button
                  className="inline-flex min-h-8 items-center rounded-lg px-2 text-op-xs font-medium text-destructive hover:bg-destructive-soft"
                  data-action-id="cliente.ficha.desactivar"
                  type="submit"
                >
                  Desactivar
                </button>
              </form>
            </div>
            {ficha.formula ? (
              <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 font-mono text-sm text-foreground">{ficha.formula}</p>
            ) : null}
            {ficha.insumos && ficha.insumos.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ficha.insumos.map((insumo) => (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-op-xs font-mono text-foreground shadow-2xs"
                    key={insumo.id}
                  >
                    <span className="font-semibold">{insumo.nombre}</span>
                    <span className="text-muted-foreground">({insumo.cantidad} {insumo.unidad})</span>
                    {insumo.proporcion ? <span className="text-primary font-sans">[{insumo.proporcion}]</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            {ficha.notas ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{ficha.notas}</p> : null}
            {(() => {
              const fotoAntes = ficha.fotosDetalle?.find((d) => d.rol === "antes")?.claveR2;
              const fotoDespues = ficha.fotosDetalle?.find((d) => d.rol === "despues")?.claveR2;
              if (fotoAntes && fotoDespues) {
                return (
                  <div className="mt-3 max-w-sm">
                    <AntesDespuesSlider
                      antesUrl={`/api/medios/${encodeURI(fotoAntes)}`}
                      aspectRatioClass="aspect-video"
                      despuesUrl={`/api/medios/${encodeURI(fotoDespues)}`}
                    />
                  </div>
                );
              }
              return null;
            })()}
            {ficha.fotos.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {ficha.fotos.map((clave) => {
                  const detalle = ficha.fotosDetalle?.find((d) => d.claveR2 === clave);
                  return (
                    <div className="relative" key={clave}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- la ruta exige sesión; next/image no reenvía cookies */}
                      <img
                        alt="Foto de la ficha"
                        className="size-16 rounded-lg border border-border object-cover"
                        loading="lazy"
                        src={`/api/medios/${encodeURI(clave)}`}
                      />
                      {detalle?.rol ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-op-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                          {detalle.rol}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    );

  const ultimaFichaQuimica = fichaRows.find((f) => f.tipo === "color" || f.tipo === "tratamiento");
  const retencionSugerida = ultimaFichaQuimica
    ? calcularRetencionSugerida({
        fechaServicio: ultimaFichaQuimica.createdAt,
        formula: ultimaFichaQuimica.formula,
        tipoFicha: ultimaFichaQuimica.tipo,
        clienteNombre: nombreCompleto,
        salonNombre: organization.nombre,
        telefonoCliente: cliente.telefono,
        slugReserva: organization.slug,
      })
    : null;

  const formulasTab = (
    <div className="space-y-6">
      {retencionSugerida ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarHeart className="size-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Radar de Retención Predictiva
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-op-xs font-semibold ${
                  retencionSugerida.estadoCiclo === "ventana_optima"
                    ? "border-warning/30 bg-warning-soft text-warning-soft-foreground"
                    : retencionSugerida.estadoCiclo === "vencido"
                    ? "border-destructive/30 bg-destructive-soft text-destructive-soft-foreground"
                    : "border-success/30 bg-success-soft text-success-soft-foreground"
                }`}
              >
                {retencionSugerida.estadoCiclo === "ventana_optima"
                  ? "¡Ventana ideal de retoque!"
                  : retencionSugerida.estadoCiclo === "vencido"
                  ? "Retoque vencido"
                  : `A tiempo (${retencionSugerida.diasRestantes} días restantes)`}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              Próximo servicio sugerido: {retencionSugerida.tituloTratamiento}
            </p>
            <p className="text-op-xs leading-relaxed text-muted-foreground">
              {retencionSugerida.motivoExplicativo} · Fecha recomendada:{" "}
              <strong className="text-foreground">
                {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(
                  retencionSugerida.fechaSugerida,
                )}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {retencionSugerida.whatsappUrl ? (
              <a
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-success-soft px-3.5 text-op-xs font-semibold text-success-soft-foreground shadow-sm transition hover:opacity-90"
                data-action-id="cliente.retencion.whatsapp"
                href={retencionSugerida.whatsappUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle className="size-4" />
                WhatsApp recordatorio
              </a>
            ) : null}
            <Link
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-op-xs font-semibold text-foreground hover:bg-muted"
              data-action-id="cliente.retencion.agendar"
              href={buildAdminHref("/agenda", {
                organizationId: organization.id,
                extra: { nueva: "1", clienteId: cliente.id },
              })}
            >
              <Calendar className="size-3.5" />
              Agendar cita
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Registrar fórmula o tratamiento</h3>
          <div className="mt-4">
            <FichaForm
              clienteId={cliente.id}
              clienteNombre={nombreCompleto}
              organizationId={organization.id}
              tipoDefault="color"
            />
          </div>
        </section>
        <div>{fichaList(fichasPorTipo(["color", "tratamiento"]), "Sin fórmulas registradas", "Registra la primera fórmula para verla aquí.")}</div>
      </div>
    </div>
  );

  const alergiasTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Registrar alergia o nota</h3>
        <div className="mt-4">
          <FichaForm clienteId={cliente.id} organizationId={organization.id} puedePrivada={puedePrivado} tipoDefault="alergia" />
        </div>
      </section>
      <div>{fichaList(fichasPorTipo(["alergia", "nota"]).filter((ficha) => !ficha.privada), "Sin alergias ni notas", "Las alergias y notas públicas del expediente aparecerán aquí.")}</div>
    </div>
  );

  const privadoTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Registrar nota privada</h3>
        <p className="mt-1 text-op-xs text-muted-foreground">
          Solo visible para usuarios con permiso de expediente privado.
        </p>
        <div className="mt-4">
          <FichaForm clienteId={cliente.id} organizationId={organization.id} puedePrivada tipoDefault="nota" />
        </div>
      </section>
      <div>{fichaList(fichaRows.filter((ficha) => ficha.privada), "Sin notas privadas", "Las observaciones internas del expediente aparecerán aquí.")}</div>
    </div>
  );

  const consentimientosTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Registrar consentimiento informado</h3>
        <p className="mt-1 text-op-xs text-muted-foreground">
          Evidencia de que el cliente aceptó (o rechazó) el procedimiento tras informarse.
        </p>
        <div className="mt-4">
          <ConsentimientoForm
            clienteId={cliente.id}
            nombreCliente={[cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(" ")}
            organizationId={organization.id}
          />
        </div>
      </section>
      {consentRows.length === 0 ? (
        <EmptyState
          className="px-4 py-6"
          description="Los consentimientos firmados por el cliente aparecerán aquí."
          title="Sin consentimientos registrados"
        />
      ) : (
        <ul className="space-y-3">
          {consentRows.map((consent) => (
            <li className="rounded-xl border border-border px-4 py-3" key={consent.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{consent.titulo}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-op-xs font-semibold ${
                    consent.respuesta === "aceptado"
                      ? "bg-success-soft text-success-soft-foreground"
                      : "bg-destructive-soft text-destructive-soft-foreground"
                  }`}
                >
                  {consent.respuesta === "aceptado" ? "Aceptado" : "Rechazado"}
                </span>
                {consent.servicioNombre ? (
                  <span className="text-op-xs text-muted-foreground">· {consent.servicioNombre}</span>
                ) : null}
                <span className="ml-auto text-op-xs tabular-nums text-muted-foreground">
                  {formatDate(consent.createdAt, { timeZone })}
                  {consent.autorNombre ? ` · ${consent.autorNombre}` : ""}
                </span>
                <form action={toggleConsentimientoActivo}>
                  <input name="organizacionId" type="hidden" value={organization.id} />
                  <input name="id" type="hidden" value={consent.id} />
                  <input name="activo" type="hidden" value="true" />
                  <button
                    className="inline-flex min-h-8 items-center rounded-lg px-2 text-op-xs font-medium text-destructive hover:bg-destructive-soft"
                    data-action-id="cliente.consentimiento.desactivar"
                    type="submit"
                  >
                    Desactivar
                  </button>
                </form>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground">
                {consent.contenido}
              </p>
              <p className="mt-2 text-op-xs font-medium text-muted-foreground">Firmado por: {consent.firmadoPor}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            <Button
              data-action-id="cliente.editar"
              nativeButton={false}
              render={
                <Link
                  href={buildAdminHref("/clientes", { organizationId: organization.id, extra: { edit: cliente.id } })}
                  prefetch={false}
                />
              }
              size="lg"
              variant="outline"
            >
              Editar datos
            </Button>
            <Button
              data-action-clave="1"
              data-action-id="cliente.cita.agendar"
              nativeButton={false}
              render={
                <Link
                  href={buildAdminHref("/agenda", {
                    organizationId: organization.id,
                    extra: { nueva: "1", clienteId: cliente.id },
                  })}
                />
              }
              size="lg"
            >
              <Calendar aria-hidden="true" />
              Nueva cita
            </Button>
          </>
        }
        breadcrumbs={[
          { label: "Clientes", href: buildAdminHref("/clientes", { organizationId: organization.id }) },
          { label: cliente.nombre },
        ]}
        description={[cliente.telefono, cliente.correo].filter(Boolean).join(" · ") || undefined}
        title={cliente.nombre}
      />
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <FormTabs
          tabs={[
            { id: "datos", label: "Datos", content: datosTab },
            { id: "historial", label: "Historial", content: historialTab },
            { id: "formulas", label: "Fórmulas", content: formulasTab },
            ...(puedeAlergias ? [{ id: "alergias", label: "Alergias", content: alergiasTab }] : []),
            ...(puedePrivado ? [{ id: "privado", label: "Privado", content: privadoTab }] : []),
            { id: "consentimientos", label: "Consentimientos", content: consentimientosTab },
          ]}
        />
      </div>
    </div>
  );
}
