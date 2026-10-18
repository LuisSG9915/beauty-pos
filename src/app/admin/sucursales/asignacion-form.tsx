"use client";

import { useActionState, useState } from "react";

import { setUsuarioSucursalesAction } from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

export type MiembroAsignable = {
  usuarioId: string;
  nombre: string;
  correo: string | null;
  /**
   * Sucursales ACTIVAS asignadas explícitamente a la persona. Lista vacía =
   * "Todas las sucursales": ve cualquiera, incluidas las nuevas.
   */
  sucursalIds: string[];
  /** Nombres de sucursales asignadas fuera del alcance del editor. */
  fueraDeAlcance?: string[];
};

export type SucursalOpcion = { id: string; nombre: string };

/**
 * Control por persona para definir en qué sucursales trabaja. Es la única
 * fuente de la asignación: se usa igual en la ficha del miembro (Equipo) y
 * en la tarjeta de la sucursal ("Equipo"), ambas llaman a
 * `setUsuarioSucursalesAction`.
 *
 * Regla visible: "Todas las sucursales" = sin filas en
 * `rel_usuarios_sucursales`. Al apagar el interruptor se pre-marca la
 * sucursal actual cuando la persona no tenía asignaciones.
 */
export function MiembroSucursalesForm({
  organizationId,
  miembro,
  sucursales,
  sucursalActualId,
  disabled = false,
  mostrarIdentidad = true,
}: {
  organizationId: string;
  miembro: MiembroAsignable;
  /** Sucursales activas dentro del alcance del editor (las que puede asignar). */
  sucursales: SucursalOpcion[];
  /** Pre-marcada al apagar "Todas" cuando la persona no tenía asignaciones. */
  sucursalActualId?: string;
  /** Sin permiso de edición o es la propia cuenta: control de solo lectura. */
  disabled?: boolean;
  /** En la ficha de la persona el nombre ya aparece arriba; ocultarlo aquí. */
  mostrarIdentidad?: boolean;
}) {
  const [state, action, pending] = useActionState(setUsuarioSucursalesAction, initialActionState);
  const [todas, setTodas] = useState(miembro.sucursalIds.length === 0);
  const [seleccionadas, setSeleccionadas] = useState<ReadonlySet<string>>(
    () => new Set(miembro.sucursalIds),
  );
  const fueraDeAlcance = miembro.fueraDeAlcance ?? [];

  const cambiarTodas = (valor: boolean) => {
    setTodas(valor);
    // Al apagar "Todas" se pre-marca la sucursal actual si no hay ninguna
    // elegida todavía — la persona no queda "sin sucursal" por accidente.
    if (!valor && seleccionadas.size === 0 && sucursalActualId) {
      if (sucursales.some((sucursal) => sucursal.id === sucursalActualId)) {
        setSeleccionadas(new Set([sucursalActualId]));
      }
    }
  };

  const alternar = (sucursalId: string, marcada: boolean) => {
    const siguiente = new Set(seleccionadas);
    if (marcada) siguiente.add(sucursalId);
    else siguiente.delete(sucursalId);
    setSeleccionadas(siguiente);
  };

  // Todas apagada + ninguna en alcance + ninguna fuera = la persona quedaría
  // "sin sucursal" por accidente; con fueraDeAlcance>0 sí está restringida.
  const sinElegir = !todas && seleccionadas.size === 0 && fueraDeAlcance.length === 0;

  return (
    <form action={action} className="space-y-3">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="usuarioId" type="hidden" value={miembro.usuarioId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {mostrarIdentidad ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{miembro.nombre}</p>
            {miembro.correo ? (
              <p className="truncate text-op-xs text-muted-foreground">{miembro.correo}</p>
            ) : null}
          </div>
        ) : null}
        <label
          className={cn(
            "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-op-xs font-medium transition-colors",
            todas
              ? "border-primary bg-accent/70 text-primary"
              : "border-border bg-card text-muted-foreground",
            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:border-accent-foreground/30",
          )}
        >
          <input
            aria-label={`Todas las sucursales para ${miembro.nombre}`}
            checked={todas}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => cambiarTodas(event.target.checked)}
            role="switch"
            type="checkbox"
          />
          <span
            aria-hidden="true"
            className={cn(
              "relative h-4.5 w-8 shrink-0 rounded-full transition-colors",
              todas ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-3.5 rounded-full bg-card shadow transition-transform",
                todas ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </span>
          Todas las sucursales
        </label>
      </div>

      {todas ? (
        <p className="text-op-xs leading-5 text-muted-foreground">
          Ve cualquier sucursal, incluidas las nuevas (perfil administrativo).
        </p>
      ) : (
        <>
          <p className="text-op-xs leading-5 text-muted-foreground">
            Sucursal fija asignada: las ventas, citas y operaciones de este trabajador se vincularán automáticamente a la sucursal seleccionada.
          </p>
          <div className="flex flex-wrap gap-2">
            {sucursales.map((sucursal) => (
              <label
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-op-xs font-medium transition-colors",
                  disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                  seleccionadas.has(sucursal.id)
                    ? "border-primary bg-accent/70 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30",
                )}
                key={sucursal.id}
              >
                <input
                  checked={seleccionadas.has(sucursal.id)}
                  className="sr-only"
                  disabled={disabled}
                  name="sucursalIds"
                  onChange={(event) => alternar(sucursal.id, event.target.checked)}
                  type="checkbox"
                  value={sucursal.id}
                />
                {sucursal.nombre}
              </label>
            ))}
            {fueraDeAlcance.map((nombre) => (
              <span
                className="inline-flex min-h-9 items-center rounded-full border border-dashed border-border bg-muted/60 px-3 text-op-xs font-medium text-muted-foreground"
                key={nombre}
                title="Fuera de tu alcance"
              >
                {nombre}
              </span>
            ))}
          </div>
        </>
      )}

      {sinElegir ? (
        <p className="text-op-xs font-medium text-warning" role="alert">
          Marca al menos una sucursal o vuelve a activar «Todas».
        </p>
      ) : null}
      <ActionFeedback state={state} />
      {disabled ? null : (
        <Button
          className="rounded-xl"
          disabled={pending || sinElegir}
          size="sm"
          type="submit"
          variant="outline"
        >
          {pending ? "Guardando…" : "Guardar sucursales"}
        </Button>
      )}
    </form>
  );
}

/**
 * Asignación de equipo desde la tarjeta de la sucursal: lista a cada miembro
 * con el mismo control por persona (`MiembroSucursalesForm`), así la regla
 * "sin asignación = ve todas" se ve igual en ambos lugares.
 */
export function SucursalAsignacionForm({
  organizationId,
  sucursalId,
  miembros,
  sucursales,
  editorUsuarioId,
}: {
  organizationId: string;
  /** Sucursal cuya ficha abrió el panel: pre-marcada al apagar "Todas". */
  sucursalId: string;
  miembros: MiembroAsignable[];
  sucursales: SucursalOpcion[];
  /** La cuenta del editor queda de solo lectura (no puede restringirse). */
  editorUsuarioId?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">
        Elige quién trabaja aquí. Con «Todas», la persona ve cualquier sucursal, incluidas las
        nuevas; al apagarla eliges sus sucursales una a una.
      </p>
      <ul className="space-y-3">
        {miembros.map((miembro) => (
          <li className="rounded-xl border border-border p-4" key={miembro.usuarioId}>
            <MiembroSucursalesForm
              disabled={miembro.usuarioId === editorUsuarioId}
              miembro={miembro}
              organizationId={organizationId}
              sucursalActualId={sucursalId}
              sucursales={sucursales}
            />
            {miembro.usuarioId === editorUsuarioId ? (
              <p className="mt-2 text-op-xs text-muted-foreground">
                Es tu cuenta: tus sucursales se gestionan desde otro perfil para no dejarte fuera.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
