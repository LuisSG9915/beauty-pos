"use client";

import { setSucursalActivaAction } from "@/app/admin/sucursales/actions";
import { ToggleActivo } from "@/components/admin/toggle-activo";

/**
 * Activa/desactiva una sucursal sin borrar su historial. Usa el patrón
 * compartido `ToggleActivo`: la baja muestra "Deshacer" durante 5 s y la
 * acción (`setSucursalActivaAction`) valida plan y cobertura en el servidor.
 */
export function SucursalToggle({
  organizationId,
  sucursalId,
  nombre,
  activo,
}: {
  organizationId: string;
  sucursalId: string;
  nombre: string;
  activo: boolean;
}) {
  return (
    <ToggleActivo
      action={setSucursalActivaAction}
      activo={activo}
      confirmHint="Dejará de aparecer en la agenda, el punto de venta y el selector de sucursal."
      entidad="sucursal"
      id={sucursalId}
      labels={{
        baja: "Desactivar",
        articulo: "la",
        participioAlta: "activada",
        participioBaja: "desactivada",
      }}
      nombre={nombre}
      organizationId={organizationId}
      telemetryBase="sucursales.sucursal"
    />
  );
}
