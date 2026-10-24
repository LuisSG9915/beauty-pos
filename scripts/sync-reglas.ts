/**
 * Sincroniza las reglas de agente entre Windsurf (`.windsurf/rules/`) y
 * Antigravity (`.agents/rules/`).
 *
 * `.windsurf/rules/` es la fuente de verdad: los archivos se copian tal cual
 * (el frontmatter `trigger:` es el mismo formato que entiende Antigravity) y se
 * les añade una nota al final. Los archivos propios de `.agents/rules/`
 * (p. ej. `00-plan-maestro.md`) no se tocan.
 *
 * Uso: `pnpm reglas:sync`.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ORIGEN = ".windsurf/rules";
const DESTINO = ".agents/rules";
const NOTA = "\n\n<!-- Generado por scripts/sync-reglas.ts desde .windsurf/rules; no editar a mano. -->\n";

async function main() {
  const archivos = (await readdir(ORIGEN)).filter((nombre) => nombre.endsWith(".md")).sort();
  if (archivos.length === 0) {
    console.error(`No hay reglas en ${ORIGEN}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(DESTINO, { recursive: true });

  for (const archivo of archivos) {
    const contenido = await readFile(join(ORIGEN, archivo), "utf8");
    if (!contenido.startsWith("---\n")) {
      console.error(`La regla ${archivo} no empieza con frontmatter; se omite.`);
      process.exitCode = 1;
      continue;
    }
    await writeFile(join(DESTINO, archivo), contenido.trimEnd() + NOTA, "utf8");
    console.log(`regla sincronizada: ${ORIGEN}/${archivo} → ${DESTINO}/${archivo}`);
  }

  console.log(`\n${archivos.length} reglas sincronizadas.`);
}

void main();
