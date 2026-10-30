"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catCategoriasServicios, servicios } from "@/db/schema/catalogs";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { getAdminContext } from "@/lib/admin-context";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { canAccessBranch, resolveAccessSafe } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { slugClave } from "@/lib/clave";
import { cargarEstadoNegocio, invalidarCacheOnboarding } from "@/modules/onboarding/queries";
import { evaluarPasos, obtenerPackArranque, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";
import { registrarAccionGuia } from "@/modules/onboarding/service";

const accionGuiaSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid().optional().or(z.literal("")),
  accion: z.enum(["omitir", "reanudar", "reiniciar"]),
});

/**
 * Omitir / reanudar / reiniciar la guía de configuración. Cualquier miembro
 * activo controla su propia guía; no se requiere un permiso de módulo.
 * `pasoActual` se deriva del estado real del negocio cuando la sucursal es
 * accesible, para reanudar donde corresponde.
 */
export async function actualizarGuia(formData: FormData): Promise<ActionState> {
  const parsed = parseWithSchema(
    accionGuiaSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la acción de la guía.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(input.organizacionId, user);
  if (!access) return actionError("No tienes acceso a este negocio.");

  const db = getDatabase();
  let pasoActual = 0;
  if (input.sucursalId && input.accion !== "reiniciar" && canAccessBranch(access, input.sucursalId)) {
    const estado = await cargarEstadoNegocio(db, input.organizacionId, input.sucursalId);
    const pasos = pasosParaPermisos(access.esPlataforma ? null : access.permissions);
    pasoActual = Math.max(0, resumenGuia(evaluarPasos(pasos, estado)).siguiente);
  }

  try {
    await registrarAccionGuia(db, {
      organizacionId: input.organizacionId,
      usuarioId: user.id,
      accion: input.accion,
      pasoActual,
    });
    await invalidarCacheOnboarding(input.organizacionId);
  } catch (error) {
    console.error("actualizarGuia", error);
    return actionError("No se pudo actualizar la guía. Intenta de nuevo.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/guia");
  revalidatePath("/admin/ayuda");

  const mensajes = {
    omitir: "Guía omitida. Puedes reanudarla cuando quieras desde Ayuda.",
    reanudar: "Guía reanudada.",
    reiniciar: "Guía reiniciada.",
  };
  return actionSuccess(mensajes[input.accion]);
}

/**
 * Carga en 1 toque un paquete inicial de categoría y servicios con precios y
 * tiempos reales de México para completar el paso de servicios de la guía.
 */
export async function aplicarPackArranqueAction(formData: FormData): Promise<ActionState> {
  const packId = String(formData.get("packId") || "");
  const pack = obtenerPackArranque(packId);
  if (!pack) {
    return actionError("El paquete seleccionado no es válido.");
  }

  const organizacionId = String(
    formData.get("organizacionId") || formData.get("organizationId") || "",
  );
  const sucursalId = String(formData.get("sucursalId") || "");

  const context = await getAdminContext({
    organizationId: organizacionId || undefined,
    sucursalId: sucursalId || undefined,
  });

  if (!context.organization || !context.organizationId) {
    return actionError("No tienes acceso a este negocio.");
  }

  if (
    !context.access.esPlataforma &&
    !context.access.permissions.has("catalogos.editar")
  ) {
    return actionError("No tienes permiso para editar catálogos.");
  }

  const db = getDatabase();
  const orgId = context.organizationId;
  const userId = context.user.id;

  try {
    // Consulta 1: categorías de la organización para detectar si ya existe la categoría
    const categoriasExistentes = await db
      .select({
        id: catCategoriasServicios.id,
        nombre: catCategoriasServicios.nombre,
        clave: catCategoriasServicios.clave,
      })
      .from(catCategoriasServicios)
      .where(eq(catCategoriasServicios.organizacionId, orgId));

    // Consulta 2: servicios existentes para evitar duplicados por nombre y resolver colisión de clave
    const serviciosExistentes = await db
      .select({
        id: servicios.id,
        nombre: servicios.nombre,
        clave: servicios.clave,
      })
      .from(servicios)
      .where(eq(servicios.organizacionId, orgId));

    let categoriaId: string;
    const catEncontrada = categoriasExistentes.find(
      (c) => c.nombre.trim().toLowerCase() === pack.categoriaNombre.trim().toLowerCase(),
    );

    if (catEncontrada) {
      categoriaId = catEncontrada.id;
    } else {
      const clavesCat = new Set(categoriasExistentes.map((c) => c.clave.toLowerCase()));
      const baseCatClave = slugClave(pack.categoriaNombre, 60);
      let catClave = baseCatClave;
      let sufijo = 2;
      while (clavesCat.has(catClave.toLowerCase())) {
        catClave = `${baseCatClave.slice(0, 60 - String(sufijo).length - 1)}-${sufijo}`;
        sufijo++;
      }

      const [nuevaCat] = await db
        .insert(catCategoriasServicios)
        .values({
          organizacionId: orgId,
          clave: catClave,
          nombre: pack.categoriaNombre,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: catCategoriasServicios.id });

      categoriaId = nuevaCat.id;
    }

    const nombresExistentes = new Set(
      serviciosExistentes.map((s) => s.nombre.trim().toLowerCase()),
    );
    const clavesExistentes = new Set(
      serviciosExistentes.map((s) => s.clave.toLowerCase()),
    );

    const serviciosAInsertar = [];
    for (const preset of pack.servicios) {
      if (nombresExistentes.has(preset.nombre.trim().toLowerCase())) {
        continue;
      }
      const baseClave = slugClave(preset.nombre, 60);
      let sClave = baseClave;
      let sufijo = 2;
      while (clavesExistentes.has(sClave.toLowerCase())) {
        sClave = `${baseClave.slice(0, 60 - String(sufijo).length - 1)}-${sufijo}`;
        sufijo++;
      }
      clavesExistentes.add(sClave.toLowerCase());
      nombresExistentes.add(preset.nombre.trim().toLowerCase());

      serviciosAInsertar.push({
        organizacionId: orgId,
        categoriaId,
        clave: sClave,
        nombre: preset.nombre,
        duracionMinutos: preset.duracionMinutos,
        precioBase: preset.precioMxn.toFixed(2),
        visibleAgenda: true,
        requiereCabina: false,
        activo: true,
        createdBy: userId,
        updatedBy: userId,
      });
    }

    if (serviciosAInsertar.length > 0) {
      await db.insert(servicios).values(serviciosAInsertar);
    }

    await invalidarCacheOnboarding(orgId);
    revalidateCatalogos(orgId, context.sucursalId);
    revalidatePath("/admin/guia");
    revalidatePath("/admin/servicios");
    revalidatePath("/admin");

    return actionSuccess(
      serviciosAInsertar.length > 0
        ? `Se activó el catálogo con ${serviciosAInsertar.length} servicio${serviciosAInsertar.length === 1 ? "" : "s"}.`
        : "Los servicios del paquete ya están en tu catálogo.",
    );
  } catch (error) {
    console.error("aplicarPackArranqueAction", error);
    return actionError("No se pudo aplicar el paquete de arranque. Intenta de nuevo.");
  }
}

