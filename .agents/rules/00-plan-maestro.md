---
trigger: always_on
---

# Plan maestro y contrato de trabajo (Melena)

- **Fuente de verdad:** `readme/README.md`. Una **misión** = un archivo en
  `readme/estados/pendiente/`; máximo una en `en-progreso/` a la vez.
- **Antes de editar:** leer la misión y `AGENTS.md`; confirmar la sección
  "Contexto verificado" (≤ 5 archivos). Si no coincide con el código, anotar
  `BLOQUEO:` al final de la misión y detenerse. No improvisar.
- **Ciclo:** `/plan` → artifact aprobado → pasos pequeños → verificación →
  reporte de 10 líneas → mover la misión a `hecho/` (o dejarla con `BLOQUEO:`).
- **Verificación obligatoria:** `pnpm typecheck`, `pnpm lint`, `pnpm test`;
  `pnpm db:check` si toca esquema; `pnpm test:usability` si toca UI (con
  `pnpm dev`); `pnpm test:perf` si toca datos o navegación; `pnpm test:smoke`
  si toca agenda, cobro, caja o auth. No se declara "listo" sin salida real.
- **Prohibido sin aprobación:** dependencias nuevas, migraciones destructivas,
  tocar prompts/fórmulas marcados como cerrados, desplegar, refactors fuera de
  alcance.
- **Límites por misión:** ≤ 2 h, ≤ 8 archivos (sin pruebas), ≤ 200k tokens de
  contexto. `/clear` entre misiones: la memoria durable es el repo, no el chat.
- **Reglas del repo que no se negocian:** no capturar conexiones en globales
  (`getRequestScope()`), no renderizar dos layouts a la vez (`VistaAdaptativa`),
  vocabulario de `src/lib/glosario.ts`, presupuesto de ≤ 2 consultas por página.
- **Sincronización:** `.windsurf/rules/` es la fuente; `.agents/rules/` se
  regenera con `pnpm reglas:sync`.
