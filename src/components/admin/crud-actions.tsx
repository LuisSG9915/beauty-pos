import Link from "next/link";

/**
 * Acciones de fila para catálogos: enlace de edición y toggle activo/inactivo.
 * `toggleAction` es una server action que recibe `organizacionId`, `id` y
 * `activo` como campos ocultos.
 */
export function CrudRowActions({
  editHref,
  id,
  activo,
  organizationId,
  toggleAction,
}: {
  editHref: string;
  id: string;
  activo: boolean;
  organizationId: string;
  toggleAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        href={editHref}
      >
        Editar
      </Link>
      <form action={toggleAction}>
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="id" type="hidden" value={id} />
        <input name="activo" type="hidden" value={String(activo)} />
        <button
          className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          type="submit"
        >
          {activo ? "Ocultar" : "Activar"}
        </button>
      </form>
    </div>
  );
}
