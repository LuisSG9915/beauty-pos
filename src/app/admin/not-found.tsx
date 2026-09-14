import Link from "next/link";

import { EmptyState } from "@/components/empty-state";

export default function AdminNotFound() {
  return (
    <EmptyState
      action={
        <Link
          className="inline-flex min-h-10 items-center rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white transition-colors hover:bg-[#744233]"
          href="/admin"
        >
          Volver al panel
        </Link>
      }
      description="La sección o el recurso que buscas no existe, fue movido o no tienes acceso con la organización actual."
      title="Página no encontrada"
    />
  );
}
