/**
 * Capa de consulta compartida de reportes: la página, el CSV y (a futuro) el
 * consolidado multisucursal leen los mismos agregados con idénticos filtros —
 * ninguna consulta agrupa por nombre visible, siempre por ID estable.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catMediosPago, productos } from "@/db/schema/catalogs";
import { usuarios } from "@/db/schema/core";
import {
  ajustesPagosVenta,
  anticipos,
  citas,
  cortesCaja,
  detalleCortes,
  detalleVentasComisiones,
  detalleVentasMediosPagos,
  detalleVentasProductos,
  detalleVentasPropinas,
  detalleVentasServicios,
  devoluciones,
  liquidacionesComisiones,
  notificacionesEnvios,
  ventas,
} from "@/db/schema/operations";
import { dayBoundsUtc } from "@/modules/agenda";
import { resumenGastos } from "@/modules/gastos/queries";

export const num = (v: string | number | null | undefined) => Number(v ?? 0);

export type ReporteFiltros = {
  organizacionId: string;
  sucursalId: string;
  timeZone: string;
  /** YYYY-MM-DD local de la sucursal (ambos inclusive). */
  desde: string;
  hasta: string;
  operativos: boolean;
  financieros: boolean;
};

export async function cargarReporte(db: ReturnType<typeof getDatabase>, filtros: ReporteFiltros) {
  const { organizacionId, sucursalId, timeZone, desde, hasta } = filtros;
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) return null;
  const iniciaAt = boundsDesde.iniciaAt;
  const terminaAt = boundsHasta.terminaAt;
  const operativos = filtros.operativos;
  const financieros = filtros.financieros;

  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const scopeVenta = () =>
    and(
      eq(ventas.organizacionId, organizacionId),
      eq(ventas.sucursalId, sucursalId),
      eq(ventas.estado, "completada"),
      eq(ventas.activo, true),
      gte(fechaVenta, iniciaAt),
      lt(fechaVenta, terminaAt),
    );
  const scopeCita = () =>
    and(
      eq(citas.organizacionId, organizacionId),
      eq(citas.sucursalId, sucursalId),
      eq(citas.activo, true),
      gte(citas.fechaHora, iniciaAt),
      lt(citas.fechaHora, terminaAt),
    );

  const [
    citasPorEstado,
    clientesNuevos,
    topServicios,
    profesionales,
    citasPorOrigen,
    avisosMetricas,
    ventasPorDia,
    pagosPorMedio,
    descuentos,
    comisionPorUsuario,
    propinaPorUsuario,
    diferenciasCorte,
    gastosResumen,
    liquidadoPorUsuario,
    devolucionesResumen,
    anticiposResumen,
    productosSinCosto,
  ] = await Promise.all([
    operativos
      ? db
          .select({ estado: citas.estado, total: sql<number>`count(*)::int` })
          .from(citas)
          .where(scopeCita())
          .groupBy(citas.estado)
      : Promise.resolve([]),
    // Clientes nuevos = primera cita COMPLETADA dentro del rango (no el alta
    // del registro). Un cliente capturado hace meses que hoy se atiende por
    // primera vez sí es "nuevo" para el negocio.
    operativos
      ? db
          .select({ total: sql<number>`count(*)::int` })
          .from(
            sql`(select ${citas.clienteId} as cliente_id, min(${citas.fechaHora}) as primera
                 from ${citas}
                 where ${citas.organizacionId} = ${organizacionId}
                   and ${citas.estado} = 'completada' and ${citas.activo} = true
                 group by ${citas.clienteId}) primera_atencion`,
          )
          .where(sql`primera >= ${iniciaAt} and primera < ${terminaAt}`)
      : Promise.resolve([{ total: 0 }]),
    operativos
      ? db
          .select({
            servicioId: detalleVentasServicios.servicioId,
            nombre: sql<string>`max(${detalleVentasServicios.nombre})`,
            unidades: sql<number>`coalesce(sum(${detalleVentasServicios.cantidad}), 0)::int`,
            importe: sql<string>`coalesce(sum(${detalleVentasServicios.precio} * ${detalleVentasServicios.cantidad}), 0)`,
          })
          .from(detalleVentasServicios)
          .innerJoin(ventas, eq(detalleVentasServicios.ventaId, ventas.id))
          .where(and(scopeVenta(), eq(detalleVentasServicios.activo, true)))
          // Agrupa por ID estable: el nombre es snapshot y puede renombrarse.
          .groupBy(detalleVentasServicios.servicioId)
          .orderBy(desc(sql`sum(${detalleVentasServicios.precio} * ${detalleVentasServicios.cantidad})`))
          .limit(10)
      : Promise.resolve([]),
    operativos
      ? db
          .select({
            usuarioId: usuarios.id,
            nombre: usuarios.nombre,
            total: sql<number>`count(*)::int`,
            completadas: sql<number>`count(*) filter (where ${citas.estado} = 'completada')::int`,
            minutos: sql<number>`coalesce(sum(${citas.duracionMinutos}), 0)::int`,
          })
          .from(citas)
          .innerJoin(usuarios, eq(citas.usuarioId, usuarios.id))
          .where(scopeCita())
          .groupBy(usuarios.id, usuarios.nombre)
          .orderBy(desc(sql`count(*)`))
      : Promise.resolve([]),
    // Citas por origen: distingue agenda interna de reservas públicas web.
    operativos
      ? db
          .select({ origen: citas.origen, total: sql<number>`count(*)::int` })
          .from(citas)
          .where(scopeCita())
          .groupBy(citas.origen)
      : Promise.resolve([]),
    // Envíos de la cola de avisos generados en el rango (la sucursal se deriva
    // de la cita — el envío no la guarda).
    operativos
      ? db
          .select({
            estado: notificacionesEnvios.estado,
            total: sql<number>`count(*)::int`,
            reintentos: sql<number>`coalesce(sum(${notificacionesEnvios.intentos}), 0)::int`,
          })
          .from(notificacionesEnvios)
          .innerJoin(citas, eq(notificacionesEnvios.citaId, citas.id))
          .where(
            and(
              eq(notificacionesEnvios.organizacionId, organizacionId),
              eq(citas.sucursalId, sucursalId),
              gte(notificacionesEnvios.createdAt, iniciaAt),
              lt(notificacionesEnvios.createdAt, terminaAt),
            ),
          )
          .groupBy(notificacionesEnvios.estado)
      : Promise.resolve([]),
    financieros
      ? db
          .select({
            dia: sql<string>`(${fechaVenta} at time zone ${timeZone})::date::text`,
            operaciones: sql<number>`count(*)::int`,
            descuentos: sql<string>`coalesce(sum(${ventas.descuento} + ${ventas.descuentoPromocion} + ${ventas.descuentoMembresia}), 0)`,
            propinas: sql<string>`coalesce(sum(${ventas.propina}), 0)`,
            total: sql<string>`coalesce(sum(${ventas.total}), 0)`,
          })
          .from(ventas)
          .where(scopeVenta())
          // GROUP BY 1 = primera columna del SELECT: con parámetros, Postgres
          // no equipara ($1) y ($8) aunque la expresión sea idéntica.
          .groupBy(sql`1`)
          .orderBy(sql`1 desc`)
      : Promise.resolve([]),
    financieros
      ? Promise.all([
          db
            .select({
              medioPagoId: detalleVentasMediosPagos.medioPagoId,
              nombre: catMediosPago.nombre,
              operaciones: sql<number>`count(*)::int`,
              total: sql<string>`coalesce(sum(${detalleVentasMediosPagos.monto}), 0)`,
            })
            .from(detalleVentasMediosPagos)
            .innerJoin(ventas, eq(detalleVentasMediosPagos.ventaId, ventas.id))
            .innerJoin(catMediosPago, eq(detalleVentasMediosPagos.medioPagoId, catMediosPago.id))
            .where(and(scopeVenta(), eq(detalleVentasMediosPagos.activo, true)))
            .groupBy(detalleVentasMediosPagos.medioPagoId, catMediosPago.nombre)
            .orderBy(desc(sql`sum(${detalleVentasMediosPagos.monto})`)),
          db
            .select({
              origenId: ajustesPagosVenta.medioPagoOrigenId,
              destinoId: ajustesPagosVenta.medioPagoDestinoId,
              total: sql<string>`coalesce(sum(${ajustesPagosVenta.monto}), 0)`,
            })
            .from(ajustesPagosVenta)
            .innerJoin(detalleVentasMediosPagos, eq(ajustesPagosVenta.detalleVentaMedioPagoId, detalleVentasMediosPagos.id))
            .innerJoin(ventas, eq(ajustesPagosVenta.ventaId, ventas.id))
            .where(and(scopeVenta(), eq(detalleVentasMediosPagos.activo, true)))
            .groupBy(ajustesPagosVenta.medioPagoOrigenId, ajustesPagosVenta.medioPagoDestinoId),
          db
            .select({ id: catMediosPago.id, nombre: catMediosPago.nombre })
            .from(catMediosPago)
            .where(eq(catMediosPago.organizacionId, organizacionId)),
        ]).then(([originales, ajustes, medios]) => {
          const nombres = new Map(medios.map((medio) => [medio.id, medio.nombre]));
          const porMedio = new Map<string, { nombre: string; operaciones: number; total: number }>();
          for (const row of originales) {
            porMedio.set(row.medioPagoId, { nombre: row.nombre, operaciones: row.operaciones, total: num(row.total) });
          }
          for (const ajuste of ajustes) {
            const origen = porMedio.get(ajuste.origenId);
            if (origen) origen.total -= num(ajuste.total);
            const destino = porMedio.get(ajuste.destinoId) ?? {
              nombre: nombres.get(ajuste.destinoId) ?? "Medio inactivo",
              operaciones: 0,
              total: 0,
            };
            destino.operaciones += 1;
            destino.total += num(ajuste.total);
            porMedio.set(ajuste.destinoId, destino);
          }
          return [...porMedio.values()]
            .filter((row) => row.total > 0.005)
            .sort((a, b) => b.total - a.total);
        })
      : Promise.resolve([]),
    financieros
      ? db
          .select({
            manual: sql<string>`coalesce(sum(${ventas.descuento}), 0)`,
            promocion: sql<string>`coalesce(sum(${ventas.descuentoPromocion}), 0)`,
            membresia: sql<string>`coalesce(sum(${ventas.descuentoMembresia}), 0)`,
          })
          .from(ventas)
          .where(scopeVenta())
      : Promise.resolve([]),
    financieros
      ? db
          .select({
            usuarioId: usuarios.id,
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${detalleVentasComisiones.monto}), 0)`,
          })
          .from(detalleVentasComisiones)
          .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
          .innerJoin(usuarios, eq(detalleVentasComisiones.usuarioId, usuarios.id))
          .where(and(scopeVenta(), eq(detalleVentasComisiones.activo, true)))
          .groupBy(usuarios.id, usuarios.nombre)
          .orderBy(desc(sql`sum(${detalleVentasComisiones.monto})`))
      : Promise.resolve([]),
    financieros
      ? db
          .select({
            usuarioId: usuarios.id,
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${detalleVentasPropinas.monto}), 0)`,
          })
          .from(detalleVentasPropinas)
          .innerJoin(ventas, eq(detalleVentasPropinas.ventaId, ventas.id))
          .innerJoin(usuarios, eq(detalleVentasPropinas.usuarioId, usuarios.id))
          .where(and(scopeVenta(), eq(detalleVentasPropinas.activo, true)))
          .groupBy(usuarios.id, usuarios.nombre)
          .orderBy(desc(sql`sum(${detalleVentasPropinas.monto})`))
      : Promise.resolve([]),
    financieros
      ? db
          .select({
            cerradoAt: cortesCaja.cerradoAt,
            cajero: usuarios.nombre,
            medio: catMediosPago.nombre,
            esperado: detalleCortes.esperado,
            contado: detalleCortes.contado,
            diferencia: detalleCortes.diferencia,
          })
          .from(detalleCortes)
          .innerJoin(cortesCaja, eq(detalleCortes.corteId, cortesCaja.id))
          .innerJoin(catMediosPago, eq(detalleCortes.medioPagoId, catMediosPago.id))
          .leftJoin(usuarios, eq(cortesCaja.usuarioId, usuarios.id))
          .where(
            and(
              eq(cortesCaja.organizacionId, organizacionId),
              eq(cortesCaja.sucursalId, sucursalId),
              eq(cortesCaja.estado, "cerrado"),
              eq(detalleCortes.activo, true),
              sql`${detalleCortes.diferencia} <> 0`,
              gte(cortesCaja.cerradoAt, iniciaAt),
              lt(cortesCaja.cerradoAt, terminaAt),
            ),
          )
          .orderBy(desc(cortesCaja.cerradoAt))
          .limit(20)
      : Promise.resolve([]),
    financieros
      ? resumenGastos(db, { organizacionId, sucursalId, desde, hasta })
      : Promise.resolve({ totalConfirmado: 0, totalRevertido: 0, porCategoria: [] }),
    // Pagado en el periodo = liquidaciones confirmadas por su fecha de
    // registro (el pago puede cubrir comisiones devengadas antes del rango).
    financieros
      ? db
          .select({
            usuarioId: usuarios.id,
            nombre: usuarios.nombre,
            total: sql<string>`coalesce(sum(${liquidacionesComisiones.total}), 0)`,
          })
          .from(liquidacionesComisiones)
          .innerJoin(usuarios, eq(liquidacionesComisiones.usuarioId, usuarios.id))
          .where(
            and(
              eq(liquidacionesComisiones.organizacionId, organizacionId),
              eq(liquidacionesComisiones.sucursalId, sucursalId),
              eq(liquidacionesComisiones.estado, "confirmada"),
              gte(liquidacionesComisiones.createdAt, iniciaAt),
              lt(liquidacionesComisiones.createdAt, terminaAt),
            ),
          )
          .groupBy(usuarios.id, usuarios.nombre)
          .orderBy(desc(sql`sum(${liquidacionesComisiones.total})`))
      : Promise.resolve([]),
    // Devoluciones registradas en el rango (por fecha de registro).
    financieros
      ? db
          .select({
            total: sql<string>`coalesce(sum(${devoluciones.monto}), 0)`,
            operaciones: sql<number>`count(*)::int`,
          })
          .from(devoluciones)
          .where(
            and(
              eq(devoluciones.organizacionId, organizacionId),
              eq(devoluciones.sucursalId, sucursalId),
              gte(devoluciones.createdAt, iniciaAt),
              lt(devoluciones.createdAt, terminaAt),
            ),
          )
      : Promise.resolve([{ total: "0", operaciones: 0 }]),
    // Anticipos cobrados en el rango — dinero de apartados, NO es venta; se
    // vuelve venta solo al aplicarse contra un cobro completado.
    financieros
      ? db
          .select({
            cobrados: sql<string>`coalesce(sum(${anticipos.monto}) filter (where ${anticipos.estado} <> 'devuelto'), 0)`,
            aplicados: sql<string>`coalesce(sum(${anticipos.monto}) filter (where ${anticipos.estado} = 'aplicado'), 0)`,
            vigentes: sql<string>`coalesce(sum(${anticipos.monto}) filter (where ${anticipos.estado} = 'vigente'), 0)`,
          })
          .from(anticipos)
          .where(
            and(
              eq(anticipos.organizacionId, organizacionId),
              eq(anticipos.sucursalId, sucursalId),
              eq(anticipos.activo, true),
              gte(anticipos.createdAt, iniciaAt),
              lt(anticipos.createdAt, terminaAt),
            ),
          )
      : Promise.resolve([{ cobrados: "0", aplicados: "0", vigentes: "0" }]),
    // Unidades de producto vendidas cuyo catálogo no tiene costo capturado:
    // el "resultado estimado" no las puede costear — el aviso lo aclara.
    financieros
      ? db
          .select({
            unidades: sql<number>`coalesce(sum(${detalleVentasProductos.cantidad}), 0)::int`,
            productos: sql<number>`count(distinct ${detalleVentasProductos.productoId})::int`,
          })
          .from(detalleVentasProductos)
          .innerJoin(ventas, eq(detalleVentasProductos.ventaId, ventas.id))
          .innerJoin(productos, eq(detalleVentasProductos.productoId, productos.id))
          .where(
            and(
              scopeVenta(),
              eq(detalleVentasProductos.activo, true),
              sql`coalesce(${productos.costo}, 0) <= 0`,
            ),
          )
      : Promise.resolve([{ unidades: 0, productos: 0 }]),
  ]);

  return {
    citasPorEstado,
    clientesNuevos,
    topServicios,
    profesionales,
    citasPorOrigen,
    avisosMetricas,
    ventasPorDia,
    pagosPorMedio,
    descuentos,
    comisionPorUsuario,
    propinaPorUsuario,
    diferenciasCorte,
    gastosResumen,
    liquidadoPorUsuario,
    devolucionesResumen,
    anticiposResumen,
    productosSinCosto,
  };
}

export type ReporteDatos = NonNullable<Awaited<ReturnType<typeof cargarReporte>>>;

/** Totales agregados del periodo anterior (misma longitud, previo inmediato). */
export async function cargarAgregadosAnteriores(
  db: ReturnType<typeof getDatabase>,
  filtros: Pick<ReporteFiltros, "organizacionId" | "sucursalId" | "timeZone"> & {
    desde: string;
    hasta: string;
    operativos: boolean;
    financieros: boolean;
  },
) {
  const { organizacionId, sucursalId, timeZone, desde, hasta } = filtros;
  const boundsDesde = dayBoundsUtc(desde, timeZone);
  const boundsHasta = dayBoundsUtc(hasta, timeZone);
  if (!boundsDesde || !boundsHasta) return { ventasAnt: [{ total: "0", operaciones: 0 }], citasAnt: [] };

  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const [ventasAnt, citasAnt] = await Promise.all([
    filtros.financieros
      ? db
          .select({
            total: sql<string>`coalesce(sum(${ventas.total}), 0)`,
            operaciones: sql<number>`count(*)::int`,
          })
          .from(ventas)
          .where(
            and(
              eq(ventas.organizacionId, organizacionId),
              eq(ventas.sucursalId, sucursalId),
              eq(ventas.estado, "completada"),
              eq(ventas.activo, true),
              gte(fechaVenta, boundsDesde.iniciaAt),
              lt(fechaVenta, boundsHasta.terminaAt),
            ),
          )
      : Promise.resolve([{ total: "0", operaciones: 0 }]),
    filtros.operativos
      ? db
          .select({ estado: citas.estado, total: sql<number>`count(*)::int` })
          .from(citas)
          .where(
            and(
              eq(citas.organizacionId, organizacionId),
              eq(citas.sucursalId, sucursalId),
              eq(citas.activo, true),
              gte(citas.fechaHora, boundsDesde.iniciaAt),
              lt(citas.fechaHora, boundsHasta.terminaAt),
            ),
          )
          .groupBy(citas.estado)
      : Promise.resolve([]),
  ]);
  return { ventasAnt, citasAnt };
}
