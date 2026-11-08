"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ModalConfirmacionCobro } from "@/components/admin/pos/modal-confirmacion-cobro";

/**
 * Componente cliente de la página de confirmación post-cobro.
 * Maneja el cierre del modal con router.push para regresar al POS.
 */
export function CobradoConfirmacion({
  ventaId,
  montoCobrado,
  moneda,
  organizacionId,
  sucursalId,
}: {
  ventaId: string;
  montoCobrado: number;
  moneda: string;
  organizacionId: string;
  sucursalId: string;
}) {
  const router = useRouter();
  const [modalAbierto, setModalAbierto] = useState(true);

  const urlPos = `/admin/pos?organizationId=${organizacionId}&sucursalId=${sucursalId}`;

  const cerrarModal = () => {
    setModalAbierto(false);
    router.push(urlPos);
    router.refresh();
  };

  return (
    <div className="min-w-0 max-w-full">
      <ModalConfirmacionCobro
        abierto={modalAbierto}
        onCerrar={cerrarModal}
        ventaId={ventaId}
        montoCobrado={montoCobrado}
        moneda={moneda}
        organizacionId={organizacionId}
        sucursalId={sucursalId}
      />
    </div>
  );
}
