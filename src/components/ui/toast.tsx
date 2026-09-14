"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { useMemo, type ComponentProps, type ReactNode } from "react";

import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

const toastIcons: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

const toastToneStyles: Record<ToastType, string> = {
  success: "border-success/40 text-foreground",
  error: "border-destructive/40 text-foreground",
  warning: "border-warning/40 text-foreground",
  info: "border-info/40 text-foreground",
};

const toastIconStyles: Record<ToastType, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((toast) => {
    const type = (toast.type as ToastType | undefined) ?? "info";
    const Icon = toastIcons[type] ?? Info;
    return (
      <ToastPrimitive.Root
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 shadow-lg transition-[opacity,transform] duration-200 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0",
          toastToneStyles[type],
        )}
        key={toast.id}
        toast={toast}
      >
        <Icon
          aria-hidden="true"
          className={cn("mt-0.5 size-4.5 shrink-0", toastIconStyles[type])}
        />
        <ToastPrimitive.Content className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastPrimitive.Title className="text-sm font-semibold" />
          <ToastPrimitive.Description className="text-sm leading-5 text-muted-foreground" />
        </ToastPrimitive.Content>
        <ToastPrimitive.Close
          aria-label="Cerrar aviso"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    );
  });
}

/**
 * Provider de toasts. Montar una vez por shell; los descendientes usan
 * `useToast()` para disparar avisos.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <ToastPrimitive.Provider timeout={6000}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}

type ToastInput = {
  title: ReactNode;
  description?: ReactNode;
  type?: ToastType;
  timeout?: number;
};

/** Hook para disparar toasts desde client components. */
export function useToast() {
  const manager = ToastPrimitive.useToastManager();
  return useMemo(
    () => ({
      toasts: manager.toasts,
      show: (options: ToastInput) => manager.add(options),
      success: (title: ReactNode, description?: ReactNode) =>
        manager.add({ title, description, type: "success" }),
      error: (title: ReactNode, description?: ReactNode) =>
        manager.add({ title, description, type: "error", priority: "high" }),
      warning: (title: ReactNode, description?: ReactNode) =>
        manager.add({ title, description, type: "warning" }),
      info: (title: ReactNode, description?: ReactNode) =>
        manager.add({ title, description, type: "info" }),
      close: (toastId?: string) => manager.close(toastId),
    }),
    [manager],
  );
}

type ActionFeedbackProps = ComponentProps<"p"> & {
  /** Estado devuelto por una server action (ver `ActionState`). */
  state?: Pick<
    ActionState,
    "error" | "message" | "success" | "status" | "warning"
  > | null;
  /** Mensaje a mostrar cuando `state.success` es true sin `message`. */
  successMessage?: string;
};

/**
 * Mensaje inline accesible para formularios: `role="alert"` en errores y
 * `role="status"` en éxitos/avisos.
 */
export function ActionFeedback({
  state,
  successMessage = "Guardado correctamente.",
  className,
  ...props
}: ActionFeedbackProps) {
  if (!state) return null;

  if (state.error) {
    return (
      <p
        className={cn(
          "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
          className,
        )}
        role="alert"
        {...props}
      >
        {state.error}
      </p>
    );
  }
  if (state.warning) {
    return (
      <p
        className={cn(
          "rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning",
          className,
        )}
        role="status"
        {...props}
      >
        {state.warning}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        className={cn(
          "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success",
          className,
        )}
        role="status"
        {...props}
      >
        {state.message ?? successMessage}
      </p>
    );
  }
  return null;
}
