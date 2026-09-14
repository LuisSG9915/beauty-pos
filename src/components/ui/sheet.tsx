"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetClose = DialogPrimitive.Close;

type SheetContentProps = ComponentProps<typeof DialogPrimitive.Popup> & {
  /** Oculta el botón de cierre superior derecho. */
  hideCloseButton?: boolean;
};

/**
 * Panel lateral deslizante anclado a la derecha (mismo patrón Portal/Backdrop/
 * Popup que `dialog.tsx`). `className` permite ampliar el ancho (p. ej. el
 * checkout usa `w-[min(100vw,54rem)]`).
 */
function SheetContent({
  className,
  children,
  hideCloseButton = false,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-black/35 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh w-[min(100vw,26rem)] flex-col gap-4 overflow-y-auto border-l border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-transform duration-200 data-ending-style:translate-x-full data-starting-style:translate-x-full supports-[-webkit-touch-callout:none]:absolute",
          className,
        )}
        {...props}
      >
        {children}
        {hideCloseButton ? null : (
          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 pr-8 text-left", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-6 text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
};
export type { SheetContentProps };
