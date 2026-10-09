import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { Calendar, CalendarHeart, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleConsentimientoActivo, toggleFichaTecnicaActiva } from "@/app/admin/client-actions";
import { ConsentimientoForm } from "@/app/admin/clientes/consentimiento-form";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { AntesDespuesSlider } from "@/components/antes-despues-slider";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FormTabs } from "@/components/form-tabs";
import { getDatabase } from "@/db/client";
import { clientes, usuarios } from "@/db/schema/core";
import { citas, clientesConsentimientos, clientesFichasTecnicas, ventas } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
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
  alergia: "bg-destructive/10 text-destructive",
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
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.organizacionId, organization.id), eq(clientes.activo, true)))
    .limit(1);
  if (!cliente) notFound();

  // El contenido sensible se excluye a nivel de consulta: las entradas privadas
  // requieren `expedientes.privado` y las alergias `expedientes.alergias_ver`.
  const fichaWhere = [
    eq(clientesFichasTecnicas.clienteId, cliente.id),
    eq(clientesFichasTecnicas.organizacionId, organization.id),
    eq(clientesFichasTecnicas.activo, true),
  ];
  if (!puedePrivado && !puedeAlergias) {
    fichaWhere.push(or(and(eq(clientesFichasTecnicas.privada, false), ne(clientesFichasTecnicas.tipo, "alergia")))!);
  } else if (!puedePrivado) {
    fichaWhere.push(eq(clientesFichasTecnicas.privada, false));
  } else if (!puedeAlergias) {
    fichaWhere.push(or(eq(clientesFichasTecnicas.privada, true), ne(clientesFichasTecnicas.tipo, "alergia"))!);
  }

  const [citaRows, ventaRows, fichaRows, consentRows] = await Promise.all([
    db
      .select({ id: citas.id, fechaHora: citas.fechaHora, estado: citas.estado, total: citas.totalEstimado, notas: citas.notas })
      .from(citas)
      .where(and(eq(citas.clienteId, cliente.id), eq(citas.organizacionId, organization.id), eq(citas.activo, true)))
      .orderBy(desc(citas.fechaHora))
      .limit(50),
    db
      .select({ id: ventas.id, fecha: sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`, estado: ventas.estado, total: ventas.total, propina: ventas.propina })
      .from(ventas)
      .where(and(eq(ventas.clienteId, cliente.id), eq(ventas.organizacionId, organization.id), eq(ventas.activo, true)))
      .orderBy(desc(sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`))
      .limit(50),
    db
      .select({
        id: clientesFichasTecnicas.id,
        tipo: clientesFichasTecnicas.tipo,
        formula: clientesFichasTecnicas.formula,
        insumos: clientesFichasTecnicas.insumos,
        tiempoPoseMinutos: clientesFichasTecnicas.tiempoPoseMinutos,
        notas: clientesFichasTecnicas.notas,
        privada: clientesFichasTecnicas.privada,
        fotos: clientesFichasTecnicas.fotos,
        fotosDetalle: clientesFichasTecnicas.fotosDetalle,
        createdAt: clientesFichasTecnicas.createdAt,
        servicioNombre: servicios.nombre,
        autorNombre: usuarios.nombre,
      })
      .from(clientesFichasTecnicas)
      .leftJoin(servicios, eq(clientesFichasTecnicas.servicioId, servicios.id))
      .leftJoin(usuarios, eq(clientesFichasTecnicas.usuarioId, usuarios.id))
      .where(and(...fichaWhere))
      .orderBy(desc(clientesFichasTecnicas.createdAt)),
    db
      .select({
        id: clientesConsentimientos.id,
        titulo: clientesConsentimientos.titulo,
        contenido: clientesConsentimientos.contenido,
        firmadoPor: clientesConsentimientos.firmadoPor,
        respuesta: clientesConsentimientos.respuesta,
        createdAt: clientesConsentimientos.createdAt,
        servicioNombre: servicios.nombre,
        autorNombre: usuarios.nombre,
      })
      .from(clientesConsentimientos)
      .leftJoin(servicios, eq(clientesConsentimientos.servicioId, servicios.id))
      .leftJoin(usuarios, eq(clientesConsentimientos.usuarioId, usuarios.id))
      .where(
        and(
          eq(clientesConsentimientos.clienteId, cliente.id),
          eq(clientesConsentimientos.organizacionId, organization.id),
          eq(clientesConsentimientos.activo, true),
        ),
      )
      .orderBy(desc(clientesConsentimientos.createdAt)),
  ]);

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
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm text-foreground">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );

  const historialTab = (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Citas</h3>
        {citaRows.length === 0 ? (
          <p className="mt-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Sin citas registradas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {citaRows.map((cita) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={cita.id}>
                <span className="tabular-nums text-muted-foreground">
                  {formatDate(cita.fechaHora, { timeZone })} · {formatTime(cita.fechaHora, { timeZone })}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cita.estado}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(cita.total, { currency })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ventas</h3>
        {ventaRows.length === 0 ? (
          <p className="mt-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Sin ventas registradas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {ventaRows.map((venta) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={venta.id}>
                <span className="tabular-nums text-muted-foreground">{formatDate(venta.fecha, { timeZone })}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{venta.estado}</span>
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

  const fichaList = (rows: typeof fichaRows, vacio: string) =>
    rows.length === 0 ? (
      <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{vacio}</p>
    ) : (
      <ul className="space-y-3">
        {rows.map((ficha) => (
          <li className="rounded-xl border border-border px-4 py-3" key={ficha.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIPO_TONE[ficha.tipo] ?? TIPO_TONE.nota}`}>
                {TIPO_LABEL[ficha.tipo] ?? ficha.tipo}
              </span>
              {ficha.privada ? (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Privada</span>
              ) : null}
              {ficha.tiempoPoseMinutos != null ? (
                <span className="text-xs font-medium text-warning">Pose {ficha.tiempoPoseMinutos} min</span>
              ) : null}
              {ficha.servicioNombre ? (
                <span className="text-xs text-muted-foreground">· {ficha.servicioNombre}</span>
              ) : null}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {formatDate(ficha.createdAt, { timeZone })}
                {ficha.autorNombre ? ` · ${ficha.autorNombre}` : ""}
              </span>
              <form action={toggleFichaTecnicaActiva}>
                <input name="organizacionId" type="hidden" value={organization.id} />
                <input name="id" type="hidden" value={ficha.id} />
                <input name="activo" type="hidden" value="true" />
                <button className="text-xs font-medium text-destructive hover:underline" type="submit">
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
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-mono text-foreground shadow-2xs"
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
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
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
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  retencionSugerida.estadoCiclo === "ventana_optima"
                    ? "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : retencionSugerida.estadoCiclo === "vencido"
                    ? "border border-destructive/20 bg-destructive/10 text-destructive"
                    : "border border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
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
            <p className="text-xs leading-relaxed text-muted-foreground">
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
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
                href={retencionSugerida.whatsappUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle className="size-4" />
                WhatsApp recordatorio
              </a>
            ) : null}
            <Link
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
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
        <div>{fichaList(fichasPorTipo(["color", "tratamiento"]), "Sin fórmulas registradas.")}</div>
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
      <div>{fichaList(fichasPorTipo(["alergia", "nota"]).filter((ficha) => !ficha.privada), "Sin alergias ni notas registradas.")}</div>
    </div>
  );

  const privadoTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Registrar nota privada</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Solo visible para usuarios con permiso de expediente privado.
        </p>
        <div className="mt-4">
          <FichaForm clienteId={cliente.id} organizationId={organization.id} puedePrivada tipoDefault="nota" />
        </div>
      </section>
      <div>{fichaList(fichaRows.filter((ficha) => ficha.privada), "Sin notas privadas registradas.")}</div>
    </div>
  );

  const consentimientosTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Registrar consentimiento informado</h3>
        <p className="mt-1 text-xs text-muted-foreground">
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
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Sin consentimientos registrados.</p>
      ) : (
        <ul className="space-y-3">
          {consentRows.map((consent) => (
            <li className="rounded-xl border border-border px-4 py-3" key={consent.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{consent.titulo}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    consent.respuesta === "aceptado" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {consent.respuesta === "aceptado" ? "Aceptado" : "Rechazado"}
                </span>
                {consent.servicioNombre ? (
                  <span className="text-xs text-muted-foreground">· {consent.servicioNombre}</span>
                ) : null}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {formatDate(consent.createdAt, { timeZone })}
                  {consent.autorNombre ? ` · ${consent.autorNombre}` : ""}
                </span>
                <form action={toggleConsentimientoActivo}>
                  <input name="organizacionId" type="hidden" value={organization.id} />
                  <input name="id" type="hidden" value={consent.id} />
                  <input name="activo" type="hidden" value="true" />
                  <button className="text-xs font-medium text-destructive hover:underline" type="submit">
                    Desactivar
                  </button>
                </form>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground">
                {consent.contenido}
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Firmado por: {consent.firmadoPor}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
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
      <p className="text-xs text-muted-foreground">
        <Link className="font-medium text-primary hover:underline" href={buildAdminHref("/clientes", { organizationId: organization.id, extra: { edit: cliente.id } })}>
          Editar datos del cliente →
        </Link>
      </p>
    </div>
  );
}
