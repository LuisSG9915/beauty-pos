import "dotenv/config";

import { randomUUID } from "node:crypto";

import { and, eq, gte, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { crearReservaPublica } from "@/modules/reservas/service";

import { getDatabase } from "./client";
import { auditoriaEventos } from "./schema/access";
import { planes, suscripciones } from "./schema/billing";
import { servicios } from "./schema/catalogs";
import {
  clientes,
  miembrosOrganizaciones,
  organizaciones,
  relUsuariosSucursales,
  sucursales,
  usuarios,
} from "./schema/core";
import {
  citas,
  citasHistorial,
  clavesIdempotencia,
  cortesCaja,
  detalleCitasServicios,
  horariosSucursales,
  notificacionesEnvios,
  rateLimitEventos,
  reservasGestionTokens,
} from "./schema/operations";

/**
 * Matriz financiera de concurrencia contra la BD real. A diferencia de los
 * tests de reglas puras, aquí se ejecutan las operaciones completas en
 * paralelo para verificar que los invariantes se sostienen bajo acceso
 * concurrente: un solo ganador por horario, un solo corte abierto por
 * sucursal y un solo dueño por clave de idempotencia.
 *
 * No corre en `pnpm test` por defecto: se habilita con RUN_DB_TESTS=1 y
 * usa la DATABASE_URL del entorno (crea y borra su propia organización).
 */
const RUN = process.env.RUN_DB_TESTS === "1";

const db = RUN ? getDatabase() : null;
const testStart = new Date();

const fixture = {
  organizacionId: "",
  sucursalId: "",
  servicioId: "",
  usuarioId: "",
  citaIds: [] as string[],
};

/** 16:00 UTC = 10:00 en America/Mexico_City (UTC-6, sin horario de verano). */
function slotMx(horaUtc: number, diasAdelante: number): Date {
  const base = new Date(Date.now() + diasAdelante * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), horaUtc, 0));
}

function clienteReserva(nombre: string, telefono: string) {
  return { nombre, telefono, correo: `${telefono}@test-conc.dev` };
}

describe.skipIf(!RUN)("concurrencia financiera (BD real)", () => {
  beforeAll(async () => {
    const database = db!;
    const [plan] = await database
      .select({ id: planes.id })
      .from(planes)
      .where(and(eq(planes.clave, "profesional"), eq(planes.activo, true)))
      .limit(1);
    if (!plan) throw new Error("Falta el plan 'profesional' sembrado (pnpm tsx scripts/seed-planes.ts).");

    const tag = randomUUID().slice(0, 8);
    const [org] = await database
      .insert(organizaciones)
      .values({ nombre: "TEST Concurrencia", slug: `test-conc-${tag}` })
      .returning({ id: organizaciones.id });
    const [suc] = await database
      .insert(sucursales)
      .values({
        organizacionId: org!.id,
        nombre: "Sucursal Test",
        clave: "TEST",
        zonaHoraria: "America/Mexico_City",
        reservasOnline: true,
        reservasAutoConfirmar: false,
        reservasAnticipacionMinutos: 0,
        reservasHorizonteDias: 30,
        capacidadSinAsignar: 1,
      })
      .returning({ id: sucursales.id });
    const [srv] = await database
      .insert(servicios)
      .values({ organizacionId: org!.id, clave: `TST-${tag}`, nombre: "Servicio Concurrencia", precioBase: "300", duracionMinutos: 60 })
      .returning({ id: servicios.id });
    const [usr] = await database
      .insert(usuarios)
      .values({ authUsuarioId: `test-conc-${tag}`, nombre: "Profesional Test", correo: `test-conc-${tag}@test.dev` })
      .returning({ id: usuarios.id });

    await database.insert(horariosSucursales).values(
      [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        organizacionId: org!.id,
        sucursalId: suc!.id,
        diaSemana: dia,
        iniciaMinutos: 540,
        terminaMinutos: 1140,
      })),
    );
    await database.insert(suscripciones).values({
      organizacionId: org!.id,
      planId: plan.id,
      estado: "activa",
      periodicidad: "mensual",
      sucursalesFacturadas: 1,
      periodoTerminaAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await database.insert(miembrosOrganizaciones).values({ organizacionId: org!.id, usuarioId: usr!.id, estado: "activo" });
    await database.insert(relUsuariosSucursales).values({ organizacionId: org!.id, usuarioId: usr!.id, sucursalId: suc!.id });

    fixture.organizacionId = org!.id;
    fixture.sucursalId = suc!.id;
    fixture.servicioId = srv!.id;
    fixture.usuarioId = usr!.id;
  });

  afterAll(async () => {
    if (!db) return;
    const { organizacionId, usuarioId, citaIds } = fixture;
    await db.delete(rateLimitEventos).where(and(eq(rateLimitEventos.bucket, "reserva_create"), gte(rateLimitEventos.createdAt, testStart)));
    await db.delete(notificacionesEnvios).where(eq(notificacionesEnvios.organizacionId, organizacionId));
    await db.delete(reservasGestionTokens).where(eq(reservasGestionTokens.organizacionId, organizacionId));
    await db.delete(auditoriaEventos).where(eq(auditoriaEventos.organizacionId, organizacionId));
    await db.delete(citasHistorial).where(eq(citasHistorial.organizacionId, organizacionId));
    // Reconsultar por si un test murió a medias y no registró sus citaIds.
    const todasLasCitas = await db.select({ id: citas.id }).from(citas).where(eq(citas.organizacionId, organizacionId));
    const idsCitas = [...new Set([...citaIds, ...todasLasCitas.map((r) => r.id)])];
    if (idsCitas.length > 0) {
      await db.delete(detalleCitasServicios).where(inArray(detalleCitasServicios.citaId, idsCitas));
    }
    await db.delete(citas).where(eq(citas.organizacionId, organizacionId));
    await db.delete(clavesIdempotencia).where(eq(clavesIdempotencia.organizacionId, organizacionId));
    await db.delete(cortesCaja).where(eq(cortesCaja.organizacionId, organizacionId));
    await db.delete(relUsuariosSucursales).where(eq(relUsuariosSucursales.organizacionId, organizacionId));
    await db.delete(miembrosOrganizaciones).where(eq(miembrosOrganizaciones.organizacionId, organizacionId));
    await db.delete(horariosSucursales).where(eq(horariosSucursales.organizacionId, organizacionId));
    await db.delete(suscripciones).where(eq(suscripciones.organizacionId, organizacionId));
    await db.delete(servicios).where(eq(servicios.organizacionId, organizacionId));
    await db.delete(clientes).where(eq(clientes.organizacionId, organizacionId));
    await db.delete(sucursales).where(eq(sucursales.organizacionId, organizacionId));
    await db.delete(usuarios).where(eq(usuarios.id, usuarioId));
    await db.delete(organizaciones).where(eq(organizaciones.id, organizacionId));

    const pools = (globalThis as { __beautyPosPools?: Map<string, { end(): Promise<void> }> }).__beautyPosPools;
    if (pools) await Promise.all([...pools.values()].map((pool) => pool.end()));
  });

  it("dos reservas concurrentes al mismo horario: solo una gana", { timeout: 30000 }, async () => {
    const fechaHora = slotMx(16, 3);
    const base = { organizacionId: fixture.organizacionId, sucursalId: fixture.sucursalId, servicioId: fixture.servicioId, fechaHora };
    const [a, b] = await Promise.all([
      crearReservaPublica({ ...base, cliente: clienteReserva("Cliente Uno", "8111000001") }),
      crearReservaPublica({ ...base, cliente: clienteReserva("Cliente Dos", "8111000002") }),
    ]);

    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    const perdedor = a.ok ? b : a;
    expect(perdedor.ok).toBe(false);

    const rows = await db!
      .select({ id: citas.id })
      .from(citas)
      .where(and(eq(citas.sucursalId, fixture.sucursalId), eq(citas.fechaHora, fechaHora)));
    expect(rows).toHaveLength(1);
    fixture.citaIds.push(...rows.map((r) => r.id));
  });

  it("carriles distintos (con y sin profesional) no se bloquean entre sí", { timeout: 30000 }, async () => {
    const fechaHora = slotMx(17, 3);
    const base = { organizacionId: fixture.organizacionId, sucursalId: fixture.sucursalId, servicioId: fixture.servicioId, fechaHora };
    const [conPro, sinPro] = await Promise.all([
      crearReservaPublica({ ...base, usuarioId: fixture.usuarioId, cliente: clienteReserva("Cliente Tres", "8111000003") }),
      crearReservaPublica({ ...base, cliente: clienteReserva("Cliente Cuatro", "8111000004") }),
    ]);

    expect(conPro.ok).toBe(true);
    expect(sinPro.ok).toBe(true);

    const rows = await db!
      .select({ id: citas.id, usuarioId: citas.usuarioId })
      .from(citas)
      .where(and(eq(citas.sucursalId, fixture.sucursalId), eq(citas.fechaHora, fechaHora)));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.usuarioId === fixture.usuarioId)).toHaveLength(1);
    expect(rows.filter((r) => r.usuarioId === null)).toHaveLength(1);
    fixture.citaIds.push(...rows.map((r) => r.id));
  });

  it("un solo corte abierto por sucursal aunque dos aperturas lleguen en paralelo", { timeout: 15000 }, async () => {
    const base = { organizacionId: fixture.organizacionId, sucursalId: fixture.sucursalId, usuarioId: fixture.usuarioId };
    const results = await Promise.allSettled([
      db!.insert(cortesCaja).values({ ...base, fondoInicial: "100" }),
      db!.insert(cortesCaja).values({ ...base, fondoInicial: "200" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const abiertos = await db!
      .select({ id: cortesCaja.id })
      .from(cortesCaja)
      .where(and(eq(cortesCaja.sucursalId, fixture.sucursalId), eq(cortesCaja.estado, "abierto"), eq(cortesCaja.activo, true)));
    expect(abiertos).toHaveLength(1);
  });

  it("la clave de idempotencia de un cobro solo admite un dueño", { timeout: 15000 }, async () => {
    const clave = `test-${randomUUID()}`;
    const insertar = () =>
      db!
        .insert(clavesIdempotencia)
        .values({ organizacionId: fixture.organizacionId, clave, accion: "venta.cobrar" })
        .onConflictDoNothing({ target: [clavesIdempotencia.organizacionId, clavesIdempotencia.clave] })
        .returning({ id: clavesIdempotencia.id });

    const [primero, segundo] = await Promise.all([insertar(), insertar()]);
    expect(primero.length + segundo.length).toBe(1);

    const rows = await db!
      .select({ id: clavesIdempotencia.id })
      .from(clavesIdempotencia)
      .where(and(eq(clavesIdempotencia.organizacionId, fixture.organizacionId), eq(clavesIdempotencia.clave, clave)));
    expect(rows).toHaveLength(1);
  });
});
