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
        className="inline-flex min-h-9 items-center rounded-lg border border-[#ded8d2] px-2.5 text-xs text-[#625b55] hover:bg-[#f8f7f5]"
        href={editHref}
      >
        Editar
      </Link>
      <form action={toggleAction}>
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="id" type="hidden" value={id} />
        <input name="activo" type="hidden" value={String(activo)} />
        <button
          className="inline-flex min-h-9 items-center rounded-lg border border-[#ded8d2] px-2.5 text-xs text-[#625b55] hover:bg-[#f8f7f5]"
          type="submit"
        >
          {activo ? "Ocultar" : "Activar"}
        </button>
      </form>
    </div>
  );
}
