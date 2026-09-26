"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Formulario de catálogo en panel lateral. La página (server) lo monta solo
 * cuando la URL pide alta o edición (`?nuevo=1` / `?edit=<id>`); al cerrarlo
 * navega de regreso a `closeHref`, que debe ser la URL base del catálogo
 * conservando filtros como `q`.
 *
 * Los formularios existentes traen su propio marco de tarjeta; dentro del
 * panel se aplanan (`[&>form]`/título interno oculto) para no duplicar cromo.
 */
export function FormSheet({
  title,
  description,
  closeHref,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  closeHref: string;
  children: ReactNode;
  /** Panel más ancho para formularios con sub-secciones (insumos, etc.). */
  wide?: boolean;
}) {
  const router = useRouter();
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) router.replace(closeHref);
      }}
      open
    >
      <SheetContent className={wide ? "w-[min(100vw,44rem)]" : "w-[min(100vw,30rem)]"}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="space-y-6 [&>form]:rounded-none [&>form]:border-0 [&>form]:bg-transparent [&>form]:p-0 [&>form]:shadow-none [&>form>h2]:sr-only [&>form>p]:sr-only">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
