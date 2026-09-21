"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ClientSheetProps = {
  /** La URL a la que volver al cerrar (sin `nuevo`/`edit`/`importar`). */
  closeHref: string;
  description: string;
  open: boolean;
  title: string;
  children: ReactNode;
};

/**
 * Panel lateral para alta/edición/importación de clientes. El estado abierto
 * vive en la URL (SSR y enlaces directos); al cerrar se navega a `closeHref`.
 */
export function ClientSheet({ closeHref, description, open, title, children }: ClientSheetProps) {
  const router = useRouter();
  const [cerrado, setCerrado] = useState(false);
  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          setCerrado(true);
          router.push(closeHref);
        }
      }}
      open={open && !cerrado}
    >
      <SheetContent className="w-[min(100vw,30rem)]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
