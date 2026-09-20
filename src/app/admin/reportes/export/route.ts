import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { sucursales } from "@/db/schema/core";
import { auditEvent } from "@/lib/audit";
import { hasPermission, resolveAccess } from "@/lib/auth/authorization";
import { todayDateInput } from "@/lib/format";
import { normalizeDateInput } from "@/lib/url-context";
import { shiftDateKey } from "@/modules/agenda";
import { cargarAgregadosAnteriores, cargarReporte, num } from "@/modules/reportes/queries";
import {
  derivarAvisos,
  derivarCitas,
  derivarReservasWeb,
  derivarVentas,
  escapeCsv,
  filaCsv,
  periodoAnterior,
} from "@/modules/reportes/rules";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ORIGEN_LABEL: Record<string, string> = {
  panel: "Agenda interna",
  web: "Reserva en línea",
};

const AVISO_LABEL: Record<string, string> = {
  pendiente: "En cola",
  enviando: "Enviando",
  enviado: "Aceptado por el proveedor",
  fallido: "Fallido",
  omitido: "Omitido (obsoleto)",
};

const money = (v: string | number | null | undefined) => num(v).toFixed(2);

/**
 * GET /admin/reportes/export — CSV del reporte con los mismos filtros y
 * definiciones que la pantalla (cargarReporte compartido). Requiere el
 * permiso `reportes.exportar`, distinto del de solo lectura; cada descarga
 * queda en bitácora. No incluye notas privadas ni datos fiscales.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const sucursalId = url.searchParams.get("sucursalId");
  if (!organizationId || !sucursalId) {
    return Response.json({ error: "organizationId y sucursalId son requeridos" }, { status: 400 });
  }

  const access = await resolveAccess(organizationId);
  const operativos = hasPermission(access, "reportes.operativos");
  const financieros = hasPermission(access, "reportes.financieros");
  if (!hasPermission(access, "reportes.exportar") || (!operativos && !financieros)) {
    return Response.json({ error: "Sin permiso para exportar reportes" }, { status: 403 });
  }
  if (access.branchIds && !access.branchIds.has(sucursalId)) {
    return Response.json({ error: "Sin acceso a esta sucursal" }, { status: 403 });
  }

  const db = getDatabase();
  const [branch] = await db
    .select({ nombre: sucursales.nombre, zonaHoraria: sucursales.zonaHoraria })
    .from(sucursales)
    .where(and(eq(sucursales.id, sucursalId), eq(sucursales.organizacionId, organizationId)))
    .limit(1);
  if (!branch) return Response.json({ error: "Sucursal no encontrada" }, { status: 404 });

  const timeZone = branch.zonaHoraria ?? "America/Mexico_City";
  const hoy = todayDateInput(timeZone);
  let desde = normalizeDateInput(url.searchParams.get("desde") ?? undefined, shiftDateKey(hoy, -29) ?? hoy) ?? hoy;
  let hasta = normalizeDateInput(url.searchParams.get("hasta") ?? undefined, hoy) ?? hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const reporte = await cargarReporte(db, {
    organizacionId: organizationId,
    sucursalId,
    timeZone,
    desde,
    hasta,
    operativos,
    financieros,
  });
  if (!reporte) return Response.json({ error: "Rango de fechas inválido" }, { status: 400 });

  const anterior = periodoAnterior(desde, hasta);
  const { ventasAnt, citasAnt } = anterior
    ? await cargarAgregadosAnteriores(db, {
        organizacionId: organizationId,
        sucursalId,
        timeZone,
        desde: anterior.desde,
        hasta: anterior.hasta,
        operativos,
        financieros,
      })
    : { ventasAnt: [{ total: "0", operaciones: 0 }], citasAnt: [] };

  const lineas: string[] = [];
  const seccion = (titulo: string) => {
    lineas.push("", escapeCsv(titulo.toUpperCase()));
  };

  seccion("Parámetros");
  lineas.push(filaCsv(["Sucursal", branch.nombre]));
  lineas.push(filaCsv(["Zona horaria", timeZone]));
  lineas.push(filaCsv(["Desde", desde]));
  lineas.push(filaCsv(["Hasta", hasta]));
  if (anterior) lineas.push(filaCsv(["Periodo anterior", `${anterior.desde} a ${anterior.hasta}`]));

  const { totalCitas, completadas, asistencia } = derivarCitas(reporte.citasPorEstado);
  const { vendido, propinasTotal, operaciones } = derivarVentas(reporte.ventasPorDia);
  const descuentosRow = reporte.descuentos[0];
  const descuentosTotal = descuentosRow
    ? num(descuentosRow.manual) + num(descuentosRow.promocion) + num(descuentosRow.membresia)
    : 0;

  if (operativos) {
    seccion("Resumen operativo");
    lineas.push(filaCsv(["Citas en el rango", totalCitas]));
    lineas.push(filaCsv(["Citas completadas", completadas]));
    lineas.push(filaCsv(["Asistencia %", asistencia ?? ""]));
    lineas.push(filaCsv(["Clientes nuevos (primera atención completada)", reporte.clientesNuevos[0]?.total ?? 0]));
    lineas.push(filaCsv(["Reservas en línea", derivarReservasWeb(reporte.citasPorOrigen)]));
    lineas.push(filaCsv(["Citas periodo anterior", derivarCitas(citasAnt).totalCitas]));

    seccion("Citas por estado");
    lineas.push(filaCsv(["Estado", "Citas"]));
    for (const row of [...reporte.citasPorEstado].sort((a, b) => b.total - a.total)) {
      lineas.push(filaCsv([ESTADO_LABEL[row.estado] ?? row.estado, row.total]));
    }

    seccion("Citas por origen");
    lineas.push(filaCsv(["Origen", "Citas"]));
    for (const row of [...reporte.citasPorOrigen].sort((a, b) => b.total - a.total)) {
      lineas.push(filaCsv([ORIGEN_LABEL[row.origen] ?? row.origen, row.total]));
    }

    seccion("Avisos por correo (aceptado = recibido por el proveedor, no leído)");
    lineas.push(filaCsv(["Estado", "Avisos", "Reintentos"]));
    const avisosDerivados = derivarAvisos(reporte.avisosMetricas);
    lineas.push(filaCsv([AVISO_LABEL.enviado, avisosDerivados.avisosEnviados, ""]));
    lineas.push(filaCsv([AVISO_LABEL.fallido, avisosDerivados.avisosFallidos, ""]));
    lineas.push(filaCsv([AVISO_LABEL.omitido, avisosDerivados.avisosOmitidos, ""]));
    lineas.push(filaCsv(["En cola / enviando", avisosDerivados.avisosPendientes, ""]));
    lineas.push(filaCsv(["Reintentos acumulados", "", avisosDerivados.avisosReintentos]));

    seccion("Servicios más vendidos");
    lineas.push(filaCsv(["Servicio", "Unidades", "Importe"]));
    for (const row of reporte.topServicios) {
      lineas.push(filaCsv([row.nombre ?? "Servicio", row.unidades, money(row.importe)]));
    }

    seccion("Productividad por profesional");
    lineas.push(filaCsv(["Profesional", "Citas", "Completadas", "Minutos agendados"]));
    for (const row of reporte.profesionales) {
      lineas.push(filaCsv([row.nombre, row.total, row.completadas, row.minutos]));
    }
  }

  if (financieros) {
    seccion("Resumen financiero");
    lineas.push(filaCsv(["Vendido", money(vendido)]));
    lineas.push(filaCsv(["Vendido periodo anterior", money(ventasAnt[0]?.total)]));
    lineas.push(filaCsv(["Operaciones", operaciones]));
    lineas.push(filaCsv(["Ticket promedio", operaciones > 0 ? money(vendido / operaciones) : ""]));
    lineas.push(filaCsv(["Propinas", money(propinasTotal)]));
    lineas.push(filaCsv(["Descuentos", money(descuentosTotal)]));
    lineas.push(filaCsv(["Devoluciones", money(reporte.devolucionesResumen[0]?.total)]));
    lineas.push(filaCsv(["Anticipos cobrados", money(reporte.anticiposResumen[0]?.cobrados)]));
    lineas.push(filaCsv(["Anticipos aplicados a ventas", money(reporte.anticiposResumen[0]?.aplicados)]));
    lineas.push(filaCsv(["Anticipos vigentes", money(reporte.anticiposResumen[0]?.vigentes)]));
    lineas.push(filaCsv(["Gastos confirmados", money(reporte.gastosResumen.totalConfirmado)]));
    lineas.push(filaCsv(["Resultado estimado", money(vendido - reporte.gastosResumen.totalConfirmado)]));
    if (num(reporte.productosSinCosto[0]?.unidades) > 0) {
      lineas.push(
        filaCsv([
          "Aviso",
          `${reporte.productosSinCosto[0]?.productos} producto(s) vendidos sin costo capturado (${reporte.productosSinCosto[0]?.unidades} unidades)`,
        ]),
      );
    }

    seccion("Ventas por día");
    lineas.push(filaCsv(["Día", "Ventas", "Descuentos", "Propinas", "Total"]));
    for (const row of [...reporte.ventasPorDia].sort((a, b) => a.dia.localeCompare(b.dia))) {
      lineas.push(filaCsv([row.dia, row.operaciones, money(row.descuentos), money(row.propinas), money(row.total)]));
    }

    seccion("Cobros por medio de pago");
    lineas.push(filaCsv(["Medio", "Operaciones", "Total"]));
    for (const row of reporte.pagosPorMedio) {
      lineas.push(filaCsv([row.nombre, row.operaciones, money(row.total)]));
    }

    const financiero = new Map<string, { nombre: string; comisiones: number; liquidadas: number; propinas: number }>();
    const merge = (id: string, nombre: string, key: "comisiones" | "liquidadas" | "propinas", total: string) => {
      const actual = financiero.get(id) ?? { nombre, comisiones: 0, liquidadas: 0, propinas: 0 };
      actual[key] = num(total);
      financiero.set(id, actual);
    };
    for (const row of reporte.comisionPorUsuario) merge(row.usuarioId, row.nombre, "comisiones", row.total);
    for (const row of reporte.liquidadoPorUsuario) merge(row.usuarioId, row.nombre, "liquidadas", row.total);
    for (const row of reporte.propinaPorUsuario) merge(row.usuarioId, row.nombre, "propinas", row.total);
    seccion("Comisiones y propinas por profesional");
    lineas.push(filaCsv(["Profesional", "Devengado", "Pagado", "Propinas"]));
    for (const row of [...financiero.values()].sort((a, b) => b.comisiones + b.propinas - (a.comisiones + a.propinas))) {
      lineas.push(filaCsv([row.nombre, money(row.comisiones), money(row.liquidadas), money(row.propinas)]));
    }

    seccion("Gastos por categoría");
    lineas.push(filaCsv(["Categoría", "Total"]));
    for (const row of reporte.gastosResumen.porCategoria) {
      lineas.push(filaCsv([row.nombre, money(row.total)]));
    }

    seccion("Diferencias de corte");
    lineas.push(filaCsv(["Cierre", "Cajero", "Medio", "Esperado", "Contado", "Diferencia"]));
    for (const row of reporte.diferenciasCorte) {
      lineas.push(
        filaCsv([
          row.cerradoAt ? row.cerradoAt.toISOString() : "",
          row.cajero ?? "",
          row.medio,
          money(row.esperado),
          money(row.contado),
          money(row.diferencia),
        ]),
      );
    }
  }

  await auditEvent(db, {
    organizacionId: organizationId,
    sucursalId,
    usuarioId: access.user.id,
    accion: "reporte.exportado",
    entidad: "reporte",
    detalle: { desde, hasta, secciones: { operativos, financieros } },
  });

  const csv = `\ufeff${lineas.join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=reporte-${desde}-a-${hasta}.csv`,
    },
  });
}
