import { parseArgs } from "node:util";

export type CheckFlags = {
  /** Subcadenas de ruta para limitar el alcance (--only=pos, repetible o CSV). */
  only: string[];
  /** Nombres de viewport a correr (--viewport=movil, repetible o CSV). */
  viewports: string[];
  /** Escribir el resultado como JSON en .artifacts/. */
  json: boolean;
  /** Repeticiones por medición (--runs=5); undefined = default del script. */
  runs?: number;
  help: boolean;
};

/**
 * Flags comunes de los checks E2E: --only, --viewport, --json, --runs, -h.
 * Cada script ignora los que no aplican.
 */
export function checkFlags(): CheckFlags {
  const { values } = parseArgs({
    options: {
      only: { type: "string", multiple: true },
      viewport: { type: "string", multiple: true },
      json: { type: "boolean" },
      runs: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const csv = (v: string[] | undefined) => (v ?? []).flatMap((s) => s.split(","));
  return {
    only: csv(values.only),
    viewports: csv(values.viewport),
    json: Boolean(values.json),
    runs: values.runs ? Number(values.runs) : undefined,
    help: Boolean(values.help),
  };
}
