import { mkdirSync, writeFileSync } from "node:fs";

export type Finding = {
  pagina: string;
  viewport: string;
  tipo: string;
  severidad: "error" | "aviso";
  detalle: string;
};

/** Imprime resumen + detalle de findings; devuelve el conteo de errores. */
export function printFindings(findings: Finding[]): number {
  const errores = findings.filter((f) => f.severidad === "error");
  const avisos = findings.filter((f) => f.severidad === "aviso");
  console.log(`\n=== Resumen: ${errores.length} errores, ${avisos.length} avisos ===`);
  for (const f of findings) {
    console.log(`[${f.severidad}] ${f.viewport} ${f.pagina} ${f.tipo}: ${f.detalle}`);
  }
  return errores.length;
}

/**
 * Persiste un resultado en .artifacts/<nombre>-<timestamp>.json (gitignored)
 * para comparar corridas o consumirlo desde otra herramienta. Devuelve la ruta.
 */
export function writeArtifact(nombre: string, data: unknown): string {
  mkdirSync(".artifacts", { recursive: true });
  const file = `.artifacts/${nombre}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`artefacto: ${file}`);
  return file;
}
