"use client";

import { AdminCard } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

import type { AgendaCita } from "./agenda-types";
import { EstadoVistaBadge } from "./cita-card";

/**
 * Vista lista: tabla compacta para revisar/exportar sin la rejilla horaria.
 * El estado usa el mismo vocabulario y colores que las tarjetas del día.
 */
export function ListView({
  citas,
  currency,
  timeZone,
  onSelectCita,
}: {
  citas: AgendaCita[];
  currency: string;
  timeZone: string;
  onSelectCita: (id: string) => void;
}) {
  return (
    <AdminCard className="overflow-hidden p-0 sm:p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha y hora</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Profesional</th>
              <th className="px-4 py-3 font-medium">Servicios</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {citas.map((cita) => (
              <tr className="hover:bg-muted/50" key={cita.id}>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDate(cita.fechaHora, { timeZone })}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatTime(cita.fechaHora, { timeZone })}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{cita.clienteNombre}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {cita.usuarioNombre ?? "Sin asignar"}
                </td>
                <td className="max-w-56 truncate px-4 py-3 text-xs text-muted-foreground">
                  {cita.servicios.map((servicio) => servicio.nombre).join(", ") || "Sin servicios"}
                  {cita.recursos.length > 0 ? (
                    <span className="block text-op-xs text-muted-foreground/80">
                      {cita.recursos.map((recurso) => recurso.nombre).join(", ")}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <EstadoVistaBadge cita={cita} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(cita.totalEstimado, { currency })}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button onClick={() => onSelectCita(cita.id)} size="sm" type="button" variant="outline">
                    Ver
                  </Button>
                </td>
              </tr>
            ))}
            {citas.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
                  No hay citas que coincidan con el filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}
