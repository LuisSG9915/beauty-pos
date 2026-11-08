"use client";

import { useState } from "react";

import {
  Calendar,
  CreditCard,
  DollarSign,
  LayoutGrid,
  Maximize,
  PiggyBank,
  Printer,
  Users,
} from "lucide-react";

import type { CaracteristicaPos } from "@/modules/pos/caracteristicas";

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  "agenda-citas": Calendar,
  "cobro-caja": CreditCard,
  "ventas-tienda": DollarSign,
  "clientes-marketing": Users,
  "pagina-presencia": Maximize,
  caja: LayoutGrid,
  impresion: Printer,
  gastos: PiggyBank,
};

type TarjetaCaracteristicaPosProps = {
  caracteristica: CaracteristicaPos;
  activo: boolean;
  onCambiar: (activo: boolean) => void;
};

/** Tarjeta con toggle para activar/desactivar una característica del POS. */
export function TarjetaCaracteristicaPos({
  caracteristica,
  activo,
  onCambiar,
}: TarjetaCaracteristicaPosProps) {
  const Icono = ICONOS[caracteristica.clave] ?? LayoutGrid;
  const [activoLocal, setActivoLocal] = useState(activo);

  return (
    <div className="rounded-xl border border-background bg-card p-4 shadow-sm hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icono className="h-5 w-5 text-warning" />
          <div>
            <h3 className="font-semibold leading-none text-foreground">{caracteristica.etiqueta}</h3>
            <p className="text-op-xs text-muted-foreground">
              {caracteristica.descripcion}
            </p>
          </div>
        </div>
        <div
          role="switch"
          aria-checked={activoLocal}
          data-state={activoLocal ? "checked" : "unchecked"}
          className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-warning data-[state=checked]:border-warning"
          onClick={() => {
            const siguiente = !activoLocal;
            setActivoLocal(siguiente);
            onCambiar(siguiente);
          }}
        >
          <span
            className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform data-[state=checked]:translate-x-[19px]"
          />
        </div>
      </div>
    </div>
  );
}
