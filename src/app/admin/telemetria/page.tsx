import { Activity } from "lucide-react";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { firstParam } from "@/lib/url-context";
import {
  accionesMasUsadas,
  paginasMasVistas,
  rebotePorEntrada,
  resumenSesiones,
  resultadosFormularios,
  webVitals,
} from "@/modules/telemetria/queries";

export const dynamic = "force-dynamic";

const RANGOS = [7, 30] as const;

const METRICA_LABELS: Record<string, { label: string; unidad: string; objetivo: number }> = {
  ttfb: { label: "TTFB", unidad: "ms", objetivo: 800 },
  fcp: { label: "FCP", unidad: "ms", objetivo: 1800 },
  lcp: { label: "LCP", unidad: "ms", objetivo: 2500 },
  cls: { label: "CLS", unidad: "", objetivo: 0.1 },
  inp: { label: "INP", unidad: "ms", objetivo: 200 },
};

export default async function TelemetriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const dias = Number(firstParam(params.dias) ?? "7") || 7;

  const [resumen, paginas, acciones, rebotes, vitals, formularios] =
    await Promise.all([
      resumenSesiones(dias),
      paginasMasVistas(dias),
      accionesMasUsadas(dias),
      rebotePorEntrada(dias),
      webVitals(dias),
      resultadosFormularios(dias),
    ]);

  const sinDatos = resumen.sesiones === 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <div className="flex gap-2">
            {RANGOS.map((rango) => (
              <a
                className={`inline-flex min-h-10 items-center rounded-xl border px-4 text-sm font-medium transition-colors ${
                  dias === rango
                    ? "border-primary bg-accent/70 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/60"
                }`}
                href={`/admin/telemetria?dias=${rango}`}
                key={rango}
              >
                {rango} días
              </a>
            ))}
          </div>
        }
        breadcrumbs={[{ label: "Panel", href: "/admin" }, { label: "Telemetría" }]}
        description="Uso real del producto: páginas, acciones, sesiones y rendimiento. Solo visible para la plataforma."
        title="Telemetría de producto"
      />

      {sinDatos ? (
        <EmptyState
          description="Aún no hay sesiones registradas en este rango. La telemetría empieza a contar desde el despliegue del colector."
          icon={Activity}
          title="Sin datos todavía"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard>
              <p className="text-xs font-medium text-muted-foreground">Sesiones</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{resumen.sesiones}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {resumen.usuariosUnicos} usuarios únicos
              </p>
            </AdminCard>
            <AdminCard>
              <p className="text-xs font-medium text-muted-foreground">Rebote</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{resumen.tasaRebote}%</p>
              <p className="mt-1 text-xs text-muted-foreground">
                sesiones sin engagement (&lt;10 s, 1 página, sin acción)
              </p>
            </AdminCard>
            <AdminCard>
              <p className="text-xs font-medium text-muted-foreground">Páginas / sesión</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {resumen.promedioPaginas.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {resumen.paginasTotales} vistas en total
              </p>
            </AdminCard>
            <AdminCard>
              <p className="text-xs font-medium text-muted-foreground">Tiempo activo</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {Math.round(resumen.promedioActivoSeg)}s
              </p>
              <p className="mt-1 text-xs text-muted-foreground">promedio por sesión</p>
            </AdminCard>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AdminCard title="Páginas más visitadas">
              <Tabla
                columnas={["Ruta", "Vistas", "Sesiones"]}
                filas={paginas.map((p) => [
                  <span className="font-mono text-xs" key="r">{p.ruta}</span>,
                  p.vistas,
                  p.sesiones,
                ])}
              />
            </AdminCard>

            <AdminCard title="Acciones más usadas">
              <Tabla
                columnas={["Acción", "Veces", "Clave"]}
                filas={acciones.map((a) => [
                  <span className="font-mono text-xs" key="a">{a.actionId}</span>,
                  a.total,
                  a.clave,
                ])}
              />
            </AdminCard>

            <AdminCard title="Rebote por página de entrada">
              <Tabla
                columnas={["Ruta de entrada", "Sesiones", "Rebote"]}
                filas={rebotes.map((r) => [
                  <span className="font-mono text-xs" key="r">{r.ruta}</span>,
                  r.sesiones,
                  `${Math.round((r.rebotes / Math.max(r.sesiones, 1)) * 100)}%`,
                ])}
              />
            </AdminCard>

            <AdminCard title="Web Vitals (p75)">
              <Tabla
                columnas={["Métrica", "p50", "p75", "p95", "Objetivo"]}
                filas={vitals.map((v) => {
                  const meta = METRICA_LABELS[v.metrica ?? ""];
                  const unidad = meta?.unidad ?? "";
                  return [
                    meta?.label ?? v.metrica ?? "?",
                    `${Math.round(v.p50)}${unidad}`,
                    <span
                      className={
                        meta && v.p75 > meta.objetivo
                          ? "font-semibold text-destructive"
                          : "tabular-nums"
                      }
                      key="p75"
                    >
                      {Math.round(v.p75)}{unidad}
                    </span>,
                    `${Math.round(v.p95)}${unidad}`,
                    meta ? `≤${meta.objetivo}${unidad}` : "—",
                  ];
                })}
              />
            </AdminCard>
          </div>

          <AdminCard title="Formularios y flujos: éxito vs error">
            <Tabla
              columnas={["Flujo", "Éxitos", "Errores", "Tasa de error"]}
              filas={formularios.map((f) => [
                <span className="font-mono text-xs" key="f">{f.actionId}</span>,
                f.exitos,
                f.errores,
                `${Math.round((f.errores / Math.max(f.exitos + f.errores, 1)) * 100)}%`,
              ])}
            />
          </AdminCard>
        </>
      )}
    </div>
  );
}

function Tabla({
  columnas,
  filas,
}: {
  columnas: string[];
  filas: (React.ReactNode | string | number)[][];
}) {
  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {columnas.map((col) => (
              <th className="pb-2 pr-4 font-medium" key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr className="border-b border-border last:border-0" key={i}>
              {fila.map((celda, j) => (
                <td className="py-2 pr-4 tabular-nums" key={j}>{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
