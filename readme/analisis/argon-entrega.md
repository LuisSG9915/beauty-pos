# Entrega del plan a Gemini 4 Argon

**Fecha:** 2026-10-23 · **Estado:** investigación cerrada, contrato listo
**Para:** quien vaya a ejecutar el plan maestro (`readme/README.md`) con Argon
en Antigravity (IDE o CLI).

> Conclusión primero: Argon **no ejecuta un `plan.md` por sí solo**. Lo que
> funciona es entregar **misiones pequeñas**, cada una con un objetivo, un
> alcance cerrado y un comando de verificación, y dejar el estado en el repo.
> Este documento explica por qué y cómo.

---

## 1. Qué es Gemini 4 Argon (hechos, no marketing)

| Dato | Valor | Fuente |
|---|---|---|
| Anuncio / model card | 30-sep-2026 / 13-oct-2026 | [blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/), [model card](https://deepmind.google/models/model-cards/gemini-4-argon/) |
| Contexto | **1M unificado** (entrada + salida comparten el millón) | [model card](https://deepmind.google/models/model-cards/gemini-4-argon/), [long decode](https://ai.google.dev/gemini-api/docs/long-decode) |
| Salida máxima | 1 048 576 − tokens de entrada | [long decode](https://ai.google.dev/gemini-api/docs/long-decode) |
| Razonamiento | `thinking_level` (API) / Low-Medium-High (Antigravity) | [long decode](https://ai.google.dev/gemini-api/docs/long-decode), [modelos](https://antigravity.google/docs/models/) |
| Precio API | $2 / $10 por 1M (hasta 30-nov-2026); $4 / $20 desde 1-dic | [pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Disponibilidad | Antigravity Pro/Ultra/Enterprise; Gemini app; API de pago. **Sin free tier** | [blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/), [planes](https://antigravity.google/docs/plans/) |
| Limitaciones declaradas | Alucinaciones, lentitud/timeouts ocasionales, corte de conocimiento marzo-2026 | [model card](https://deepmind.google/models/model-cards/gemini-4-argon/) |

**Lo que esto implica para el plan:**

- El millón es **compartido**: si metes 900k de entrada, solo quedan ~148k para
  razonar y escribir. No conviene "cargar el repo entero".
- La cuota se renueva cada 5 h y hay límite semanal: el trabajo debe partirse
  en sesiones cortas y reanudables, no en una maratón.
- El corte de conocimiento (marzo-2026) significa que **no conoce** Next 16.3,
  OpenNext 1.20 ni las APIs actuales del repo: el plan y `AGENTS.md` son su
  memoria. Hay que leer `node_modules/next/dist/docs/` antes de tocar Next.

## 2. Cómo se le entrega un plan (lo que sí está soportado)

| Mecanismo | Qué hace | Cuándo usarlo |
|---|---|---|
| `/plan` | Explora sin tocar archivos, entrevista si hay ambigüedad y produce un **Implementation Plan artifact** revisable; al aprobarlo ejecuta hito por hito validando con pruebas ([docs](https://antigravity.google/docs/plan)) | Misión individual: es el punto de entrada por defecto |
| Artifacts | Entregables revisables (plan, diff, reporte) en hitos ([docs](https://antigravity.google/docs/artifacts)) | Revisión asíncrona del dueño |
| Task groups | Objetivo, subtareas, archivos tocados y pendientes ([docs](https://antigravity.google/docs/tools/)) | Seguimiento dentro de la sesión |
| Subagentes | Contexto aislado, sin herencia del padre, worktrees; profundidad máx. 10 ([docs](https://antigravity.google/docs/subagents/)) | Investigación paralela; nunca para "pasar el plan" |
| `AGENTS.md` / `GEMINI.md` | Instrucciones permanentes del repo ([docs](https://antigravity.google/docs/rules/)) | Invariantes y contrato de trabajo |
| `.agents/rules/*.md` | Reglas con trigger `always_on`, `glob`, `model_decision` o `manual` ([docs](https://antigravity.google/docs/rules/)) | Reglas de arquitectura, datos, UI y verificación |
| `/context`, `/clear`, `/fork`, `/rewind` | Ver consumo, limpiar, bifurcar, rebobinar ([docs](https://antigravity.google/docs/cli/commands/context/)) | Higiene de contexto entre misiones |
| `/teamwork-preview` | Entrevista de alcance + prompt artifact + orquestador que reparte milestones con handoff ([docs](https://antigravity.google/docs/teamwork/)) | Solo para iniciativas de varios días |
| `agy -p --output-format json` | Modo headless para CI ([docs](https://antigravity.google/docs/cli/headless/)) | Automatizar verificaciones, no desarrollo |

**No existe** un comando documentado "ejecuta este plan.md". Por eso el plan se
entrega como: `AGENTS.md` (invariantes) + una misión por sesión + verificación
ejecutable.

## 3. Límites duros del repo (respetarlos o Argon pierde reglas)

| Límite | Valor oficial | Estado en Melena |
|---|---|---|
| `AGENTS.md` por archivo | 24 KB ([rules](https://antigravity.google/docs/rules/)) | 10,1 KB ✔ |
| Tokens agregados de reglas | 20 000 ([rules](https://antigravity.google/docs/rules/)) | ~3,5k ✔ (5 reglas + AGENTS.md) |
| Profundidad de subagentes | 10 ([subagentes](https://antigravity.google/docs/subagents/)) | — |

Si `AGENTS.md` crece por encima de 24 KB, Antigravity lo degrada a puntero: el
agente deja de ver las reglas. Por eso el detalle largo vive en `readme/` y
`AGENTS.md` solo enlaza.

## 4. Lo que dicen los benchmarks (y lo que no)

| Benchmark | Argon | Lectura |
|---|---|---|
| DeepSWE v1.1 | 77,9 % (Google, harness `mini-swe`) | Autocalculado; el leaderboard público no lista a Argon |
| Terminal-Bench 4.0 | 57,4 % (Google) vs 66,4 % Opus 5.5 | Autocalculado; Epoch AI marca la versión 4.0 como *Flawed* ([review](https://epoch.ai/benchmarks/terminal-bench-4/review)) |
| Vals Index | 68,9 (#1) | Fuente externa ([vals.ai](https://www.vals.ai/benchmarks/vals_index)) |
| Vals Time Horizon (KSP) | 52,5 % (4.º) vs 91,3 % Opus 5.5 | Una sola trayectoria de 5 días ([vals.ai](https://www.vals.ai/benchmarks/time_horizon_index)) |

**Lectura honesta:** Argon es muy bueno en tareas de código de un turno largo y
en conocimiento; **no** está probado como autónomo de varios días. El plan debe
asumir sesiones de ≤ 2 h con verificación humana entre misiones. Ningún
benchmark dice nada sobre este repo.

## 5. Contrato de entrega para Melena

### 5.1 Archivos que forman el "cerebro" del agente

| Archivo | Rol | Límite |
|---|---|---|
| `AGENTS.md` | Invariantes del repo, comandos, trampas conocidas | < 24 KB, sin duplicar `readme/` |
| `.agents/rules/*.md` | Espejo de `.windsurf/rules/` (mismos triggers) | 1 archivo por tema |
| `readme/README.md` | Plan maestro: estado, prioridades, proceso | Se lee una vez por sesión |
| `readme/PLANTILLA-PLAN.md` | Contrato de una misión | Se copia por misión |
| `readme/estados/pendiente/NN-*.md` | La misión a ejecutar | ≤ 1 por sesión |
| `readme/estados/en-progreso/NN-*.md` | Estado vivo + `BLOQUEO:` | 1 archivo |

**Sincronización de reglas:** `.windsurf/rules/` es la fuente; `.agents/rules/`
se regenera con `pnpm reglas:sync` (script `scripts/sync-reglas.ts`). No se
editan a mano las dos copias.

### 5.2 Anatomía de una misión (ya implementada en la plantilla)

1. **Metadatos:** número, nombre, prioridad, dependencias, tiempo estimado.
2. **Objetivo:** una frase con resultado observable.
3. **Fuera de alcance:** lo que el agente NO debe tocar.
4. **Contexto verificado:** archivos y líneas exactas (no "busca en el repo").
5. **Pasos:** 3–7, cada uno con su archivo.
6. **Criterios de aceptación:** comandos y salidas esperadas.
7. **Verificación:** la lista de §7 del plan maestro.
8. **Presupuesto:** contexto, archivos, duración.
9. **Criterios de parada:** `BLOQUEO:` con la condición exacta.
10. **Reporte:** formato fijo de 10 líneas.

### 5.3 Presupuesto de contexto por misión

| Concepto | Tokens objetivo | Nota |
|---|---|---|
| Reglas + `AGENTS.md` | ~5k | Se inyectan siempre |
| Plan maestro (§6–§7) | ~4k | Leer solo esas secciones |
| Misión | ~2k | |
| Código leído | ≤ 150k | 5 archivos medianos |
| Salida (código + reporte) | ≤ 30k | |
| **Total** | **≤ 200k (20 % del 1M)** | Deja margen para razonar y corregir |

Costo aproximado por misión a precio promocional ($2/$10 por 1M):
200k de entrada + 30k de salida ≈ **$0,70**; a precio completo, ≈ **$1,40**.
Veinte misiones: $14–28. Es más barato que una hora de desarrollo y el gasto es
predecible si las misiones están bien acotadas.

### 5.4 Procedimiento por sesión

```
1. Abrir Antigravity en el repo.
2. /plan  → pegar la misión (o pedirle que lea readme/estados/pendiente/NN-*.md).
3. Revisar el artifact: alcance, archivos, criterios. Aprobar o corregir.
4. Ejecutar. El agente corre la verificación tras cada hito.
5. Revisar el diff contra "Fuera de alcance".
6. Pegar el reporte en la misión y moverla a hecho/ (o dejar BLOQUEO:).
7. /clear antes de la siguiente misión.
```

### 5.5 Qué hacer cuando Argon falla

| Síntoma | Causa probable | Acción |
|---|---|---|
| Repite lecturas del mismo archivo | Contexto degradado o misión ambigua | Cerrar sesión, `/clear`, reescribir el "Contexto verificado" |
| Toca archivos fuera del alcance | Misión sin "Fuera de alcance" | Restaurar, añadir la sección, reintentar |
| Inventa APIs de Next 16 | Corte de conocimiento | Exigir lectura de `node_modules/next/dist/docs/` antes de editar |
| "Todo verde" sin pruebas | Reporte sin salida real | Rechazar el reporte; pedir comandos + salida |
| Se queda sin cuota a media misión | Misión demasiado grande | Partirla; el estado ya está en el repo |

## 6. Implicación para nuestro plan

| Requisito | Por qué | Cómo quedó |
|---|---|---|
| Objetivo + no-objetivos explícitos | Evita cambios fuera de alcance | §6 del plan maestro + misión |
| Fases de ≤ 1 sesión | Cuota de 5 h y contexto compartido | Misiones de ≤ 2 h y ≤ 8 archivos |
| Criterio de aceptación verificable | La guía oficial lo llama el factor #1 | Comando exacto por misión |
| Reglas permanentes | Se inyectan en cada turno | `AGENTS.md` + `.agents/rules/` |
| Memoria durable | El chat no es memoria | `readme/estados/` en git |
| Puerta humana | Migraciones, deploy, secretos | Política `request-review` + `BLOQUEO:` |
| Handoff entre fases | Evita degradación | `/clear` + reporte de 10 líneas |

## 7. Lo que no se pudo confirmar

- No hay guía oficial de Google para "entregar un plan multi-fase a Argon";
  este contrato es una síntesis de la documentación de Antigravity y de las
  buenas prácticas de agentes.
- No hay cifra publicada de "context rot"; el umbral del 50 % es heurística de
  ingeniería, no un dato del proveedor.
- Las cifras de DeepSWE y Terminal-Bench de Argon son autocalculadas por Google;
  no hay resultado independiente en el leaderboard público a la fecha.
- No se confirmó que Antigravity lea `.windsurf/rules/` directamente; de ahí el
  espejo en `.agents/rules/`.

## 8. Fuentes

- [Gemini 4 Argon — blog de anuncio](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/)
- [Model card](https://deepmind.google/models/model-cards/gemini-4-argon/)
- [Metodología de evaluaciones](https://deepmind.google/models/evals-methodology/gemini-4-argon/)
- [Gemini API — long decode](https://ai.google.dev/gemini-api/docs/long-decode)
- [Gemini API — precios](https://ai.google.dev/gemini-api/docs/pricing)
- [Antigravity — /plan](https://antigravity.google/docs/plan) · [artifacts](https://antigravity.google/docs/artifacts) · [reglas](https://antigravity.google/docs/rules/) · [subagentes](https://antigravity.google/docs/subagents/) · [teamwork](https://antigravity.google/docs/teamwork/) · [CLI headless](https://antigravity.google/docs/cli/headless/) · [buenas prácticas CLI](https://antigravity.google/docs/cli/best-practices/)
- [Vals AI — índice](https://www.vals.ai/benchmarks/vals_index) · [Time Horizon](https://www.vals.ai/benchmarks/time_horizon_index)
- [Epoch AI — revisión de Terminal-Bench 4.0](https://epoch.ai/benchmarks/terminal-bench-4/review)
