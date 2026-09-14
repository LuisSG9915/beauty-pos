import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleFichaTecnicaActiva } from "@/app/admin/client-actions";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FormTabs } from "@/components/form-tabs";
import { getDatabase } from "@/db/client";
import { clientes, usuarios } from "@/db/schema/core";
import { citas, clientesFichasTecnicas, ventas } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { getAdminContext } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";

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

const TIPO_TONE: Record<string, string> = {
  color: "bg-[#eef4fa] text-[#3a5a7a]",
  tratamiento: "bg-[#f2e3dc] text-[#60392e]",
  alergia: "bg-[#fdf1ee] text-[#a8443a]",
  nota: "bg-[#f1eeea] text-[#625b55]",
};

/** Expediente del cliente: datos, historial de citas/ventas y ficha técnica. */
export default async function ClienteDetallePage({ params, searchParams }: Props) {
  const { id } = await params;
  const context = await getAdminContext(await searchParams);
  const { organization, timeZone, currency } = context;

  if (!organization) notFound();
  requireAccessPermission(context.access, "clientes.ver");

  const db = getDatabase();
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.organizacionId, organization.id), eq(clientes.activo, true)))
    .limit(1);
  if (!cliente) notFound();

  const [citaRows, ventaRows, fichaRows] = await Promise.all([
    db
      .select({ id: citas.id, fechaHora: citas.fechaHora, estado: citas.estado, total: citas.totalEstimado, notas: citas.notas })
      .from(citas)
      .where(and(eq(citas.clienteId, cliente.id), eq(citas.organizacionId, organization.id), eq(citas.activo, true)))
      .orderBy(desc(citas.fechaHora))
      .limit(50),
    db
      .select({ id: ventas.id, createdAt: ventas.createdAt, estado: ventas.estado, total: ventas.total, propina: ventas.propina })
      .from(ventas)
      .where(and(eq(ventas.clienteId, cliente.id), eq(ventas.organizacionId, organization.id), eq(ventas.activo, true)))
      .orderBy(desc(ventas.createdAt))
      .limit(50),
    db
      .select({
        id: clientesFichasTecnicas.id,
        tipo: clientesFichasTecnicas.tipo,
        formula: clientesFichasTecnicas.formula,
        tiempoPoseMinutos: clientesFichasTecnicas.tiempoPoseMinutos,
        notas: clientesFichasTecnicas.notas,
        createdAt: clientesFichasTecnicas.createdAt,
        servicioNombre: servicios.nombre,
        autorNombre: usuarios.nombre,
      })
      .from(clientesFichasTecnicas)
      .leftJoin(servicios, eq(clientesFichasTecnicas.servicioId, servicios.id))
      .leftJoin(usuarios, eq(clientesFichasTecnicas.usuarioId, usuarios.id))
      .where(
        and(
          eq(clientesFichasTecnicas.clienteId, cliente.id),
          eq(clientesFichasTecnicas.organizacionId, organization.id),
          eq(clientesFichasTecnicas.activo, true),
        ),
      )
      .orderBy(desc(clientesFichasTecnicas.createdAt)),
  ]);

  const fichasPorTipo = (tipos: string[]) => fichaRows.filter((ficha) => tipos.includes(ficha.tipo));

  const datosTab = (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {[
        ["Nombre", [cliente.nombre, cliente.apellidoPaterno, cliente.apellidoMaterno].filter(Boolean).join(" ")],
        ["Teléfono", cliente.telefono],
        ["Correo", cliente.correo],
        ["Notas operativas", cliente.notasOperativas],
        ["RFC", cliente.rfc],
        ["Régimen fiscal", cliente.regimenFiscal],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-[#81746c]">{label}</dt>
          <dd className="mt-1 text-sm text-[#2d2926]">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );

  const historialTab = (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">Citas</h3>
        {citaRows.length === 0 ? (
          <p className="mt-3 rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">Sin citas registradas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eee8e3] rounded-xl border border-[#eee8e3]">
            {citaRows.map((cita) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={cita.id}>
                <span className="tabular-nums text-[#625b55]">
                  {formatDate(cita.fechaHora, { timeZone })} · {formatTime(cita.fechaHora, { timeZone })}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-[#81746c]">{cita.estado}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(cita.total, { currency })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">Ventas</h3>
        {ventaRows.length === 0 ? (
          <p className="mt-3 rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">Sin ventas registradas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eee8e3] rounded-xl border border-[#eee8e3]">
            {ventaRows.map((venta) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm" key={venta.id}>
                <span className="tabular-nums text-[#625b55]">{formatDate(venta.createdAt, { timeZone })}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-[#81746c]">{venta.estado}</span>
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
      <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">{vacio}</p>
    ) : (
      <ul className="space-y-3">
        {rows.map((ficha) => (
          <li className="rounded-xl border border-[#eee8e3] px-4 py-3" key={ficha.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIPO_TONE[ficha.tipo] ?? TIPO_TONE.nota}`}>
                {TIPO_LABEL[ficha.tipo] ?? ficha.tipo}
              </span>
              {ficha.tiempoPoseMinutos != null ? (
                <span className="text-xs font-medium text-[#986b16]">Pose {ficha.tiempoPoseMinutos} min</span>
              ) : null}
              {ficha.servicioNombre ? (
                <span className="text-xs text-[#81746c]">· {ficha.servicioNombre}</span>
              ) : null}
              <span className="ml-auto text-xs tabular-nums text-[#81746c]">
                {formatDate(ficha.createdAt, { timeZone })}
                {ficha.autorNombre ? ` · ${ficha.autorNombre}` : ""}
              </span>
              <form action={toggleFichaTecnicaActiva}>
                <input name="organizacionId" type="hidden" value={organization.id} />
                <input name="id" type="hidden" value={ficha.id} />
                <input name="activo" type="hidden" value="true" />
                <button className="text-xs font-medium text-[#a8443a] hover:underline" type="submit">
                  Desactivar
                </button>
              </form>
            </div>
            {ficha.formula ? (
              <p className="mt-2 rounded-lg bg-[#faf9f7] px-3 py-2 font-mono text-sm text-[#403a35]">{ficha.formula}</p>
            ) : null}
            {ficha.notas ? <p className="mt-2 text-sm leading-6 text-[#625b55]">{ficha.notas}</p> : null}
          </li>
        ))}
      </ul>
    );

  const formulasTab = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#2d2926]">Registrar fórmula o tratamiento</h3>
        <div className="mt-4">
          <FichaForm clienteId={cliente.id} organizationId={organization.id} tipoDefault="color" />
        </div>
      </section>
      <div>{fichaList(fichasPorTipo(["color", "tratamiento"]), "Sin fórmulas registradas.")}</div>
    </div>
  );

  const alergiasTab = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#2d2926]">Registrar alergia o nota</h3>
        <div className="mt-4">
          <FichaForm clienteId={cliente.id} organizationId={organization.id} tipoDefault="alergia" />
        </div>
      </section>
      <div>{fichaList(fichasPorTipo(["alergia", "nota"]), "Sin alergias ni notas registradas.")}</div>
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
      <div className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm sm:p-6">
        <FormTabs
          tabs={[
            { id: "datos", label: "Datos", content: datosTab },
            { id: "historial", label: "Historial", content: historialTab },
            { id: "formulas", label: "Fórmulas", content: formulasTab },
            { id: "alergias", label: "Alergias", content: alergiasTab },
          ]}
        />
      </div>
      <p className="text-xs text-[#81746c]">
        <Link className="font-medium text-[#8a5140] hover:underline" href={buildAdminHref("/clientes", { organizationId: organization.id, extra: { edit: cliente.id } })}>
          Editar datos del cliente →
        </Link>
      </p>
    </div>
  );
}
