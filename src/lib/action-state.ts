/**
 * Contrato compartido para el estado que devuelven las server actions.
 * Mantiene compatibilidad conceptual con los estados actuales
 * (`{ error?: string; success?: boolean }`) y agrega mensajes por campo.
 */
import { z } from "zod";

export type ActionStatus = "idle" | "success" | "error";

/** Errores por campo: nombre del campo → lista de mensajes. */
export type ActionFieldErrors = Record<string, string[] | undefined>;

export type ActionState<TData = unknown> = {
  /** Estado actual del envío. */
  status?: ActionStatus;
  /** `true` cuando la acción terminó bien (compat con estados existentes). */
  success?: boolean;
  /** Mensaje de error general (compat con estados existentes). */
  error?: string;
  /** Mensaje general (éxito o información adicional). */
  message?: string;
  /** Aviso no bloqueante (p. ej. posible duplicado que requiere confirmación). */
  warning?: string;
  /** Errores por campo para pintarlos junto a cada control. */
  fieldErrors?: ActionFieldErrors;
  /** Carga útil opcional devuelta por la acción. */
  data?: TData;
};

/** Estado inicial para `useActionState`. */
export const initialActionState: ActionState = {
  status: "idle",
  success: false,
};

/** Estado de éxito. */
export function actionSuccess<TData = unknown>(
  message?: string,
  data?: TData,
): ActionState<TData> {
  return { status: "success", success: true, message, data };
}

/** Estado de error general, con errores por campo opcionales. */
export function actionError(
  error: string,
  options: { fieldErrors?: ActionFieldErrors; warning?: string } = {},
): ActionState<never> {
  return {
    status: "error",
    success: false,
    error,
    fieldErrors: options.fieldErrors,
    warning: options.warning,
  };
}

/** Aviso no bloqueante (la acción puede continuar con confirmación). */
export function actionWarning(warning: string): ActionState<never> {
  return { status: "error", success: false, warning };
}

/**
 * Convierte un `z.ZodError` en un `ActionState` con `fieldErrors` y un mensaje
 * general tomado del primer issue.
 */
export function zodErrorToState(
  error: z.ZodError,
  fallback = "Revisa los datos del formulario.",
): ActionState<never> {
  const fieldErrors: ActionFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    const list = fieldErrors[key] ?? [];
    list.push(issue.message);
    fieldErrors[key] = list;
  }
  return {
    status: "error",
    success: false,
    error: error.issues[0]?.message ?? fallback,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  };
}

/** Atajo: `safeParse` + `zodErrorToState`. Devuelve `data` o `state`. */
export function parseWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
  fallback?: string,
):
  | { success: true; data: z.infer<TSchema>; state?: never }
  | { success: false; data?: never; state: ActionState<never> } {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as z.infer<TSchema> };
  }
  return { success: false, state: zodErrorToState(result.error, fallback) };
}

/** Devuelve el primer error de un campo, si existe. */
export function fieldError(
  state: ActionState | null | undefined,
  field: string,
): string | undefined {
  return state?.fieldErrors?.[field]?.[0];
}
