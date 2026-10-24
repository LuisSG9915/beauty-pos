# Prompt para Argon → plan ejecutable por Gemini 3.8 Flash

**Cómo usarlo:** abre Antigravity en el repo, entra en `/plan` (o en el chat) y
pega **solo el bloque de abajo**. Argon debe devolver un índice y una misión por
archivo; después cada misión se le pasa a Flash en una sesión distinta.

**Por qué está escrito así:** Flash es rápido y barato, pero no es un planificador
de horizonte largo. El plan tiene que quitarle decisiones, no darle libertad.

```
=== PROMPT START ===

## Rol

Eres el arquitecto del proyecto Melena (POS SaaS para salones de belleza en
México). NO implementes nada: tu único entregable es un plan de trabajo que
ejecutará después Gemini 3.8 Flash, misión por misión.

## Producto y estado real (verificado 2026-10-23)

- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Drizzle + CockroachDB
  + Better Auth + Tailwind 4, desplegado como un Worker de Cloudflare (OpenNext).
- 17 fases ya terminadas y verificadas; 562 pruebas en verde; 58 archivos de
  prueba; typecheck y lint limpios.
- Ya existe: auth con roles y permisos, agenda, POS, caja, inventario, compras
  con IA, plano del salón, ficha técnica/recetario, retención, facturación,
  comisiones, gastos, reportes, telemetría, incidentes, PWA offline.
- Tres bloqueos de lanzamiento, en este orden:
  1. `melena.app` completo está detrás de Cloudflare Access: `/`, `/precios`,
     `/registro`, `/reservar/*` y `/api/health` responden 302 al login de Zero
     Trust. Nadie puede registrarse ni reservar.
  2. Hallazgos de móvil (390 px) en POS, clientes, ventas, inventario y
     reportes: controles cortados, tablas de 644–760 px sin alternativa,
     objetivos táctiles de 18–20 px y violaciones axe.
  3. Sin presupuesto de latencia aplicado: la última línea base dio TTFB p50 de
     708–812 ms y p95 de hasta 2 200 ms en `/admin`.
- Reglas no negociables del repo: ≤ 2 consultas a la base por página; nada de
  conexiones en globales; un solo layout por viewport (`VistaAdaptativa`);
  vocabulario de `src/lib/glosario.ts`; permisos solo en servidor; los datos no
  se borran.
- Documentos que son la fuente de verdad: `AGENTS.md`, `readme/README.md`
  (plan maestro v2), `readme/PLANTILLA-PLAN.md`, las misiones
  `readme/estados/pendiente/18-*.md`, `19-*.md`, `20-*.md` y
  `readme/analisis/argon-entrega.md`.

## El ejecutor: Gemini 3.8 Flash

Asume un modelo rápido y económico, con menos contexto efectivo y poca
tolerancia a la ambigüedad. Se degrada en tareas largas, tiende a tocar más
archivos de los pedidos y a "mejorar" cosas fuera de alcance.

Consecuencias obligatorias para el plan:

- Misiones de **20–40 minutos**, no de 2 horas.
- **1–4 archivos por misión** (sin contar pruebas).
- Cada paso debe decir **archivo exacto + qué cambia**, sin decisiones abiertas.
- Si hay dos caminos posibles, **tú eliges** y lo justificas en una línea; no se
  le deja la decisión a Flash.
- Verificación después de **cada** paso, no al final.
- Si Flash tiene ventana de 1M, ignora el límite de tokens, pero conserva la
  granularidad: su punto débil es planificar, no memorizar.

## Qué debes producir

1. **Índice** en `readme/plan-flash/README.md` con: objetivo del plan, orden de
   ejecución, grafo de dependencias (simple, en texto), tabla de misiones
   (id, resultado, archivos, comando de aceptación, riesgo) y una misión 0 de
   línea base.
2. **Una misión por archivo** en `readme/plan-flash/NN-nombre-corto.md`, usando
   exactamente las 10 secciones de `readme/PLANTILLA-PLAN.md`:
   metadatos · objetivo · fuera de alcance · contexto verificado · diseño
   decidido · pasos · criterios de aceptación · verificación · presupuesto ·
   criterios de parada (`BLOQUEO:`) · reporte · desviaciones.
3. **Contrato de contexto por misión:** máximo 4 archivos a leer y una lista
   explícita de archivos que NO debe abrir (para no quemar contexto).
4. **Bloque de handoff** al final de cada misión: qué debe pegar Flash de vuelta
   (comandos, salida, tabla antes/después) para que tú, Argon, puedas revisar
   sin reabrir el repo.
5. **Trazabilidad:** cada misión enlaza al criterio S1–S6 o al presupuesto de
   `readme/README.md` §1/§4 que mejora.

## Reglas de diseño del plan

- Orden por dependencia y por impacto: primero lo que desbloquea el negocio
  (18), después lo que rompe la experiencia (19), después el rendimiento (20);
  luego P1.
- Ninguna misión puede requerir que Flash tome una decisión de arquitectura,
  de esquema o de precio.
- Cada criterio de aceptación debe ser un comando copiable con salida esperada
  (`pnpm typecheck`, `pnpm test`, `pnpm test:usability --viewport=movil
  --only=/admin/pos`, `curl -sI ... | head -1`, etc.).
- El "Contexto verificado" debe llevar rutas y líneas reales. **Ábrelas y
  compruébalas**; si no puedes, escribe `BLOQUEO:` y no inventes.
- Si una misión no cabe en 40 minutos, pártela en `NN.1` y `NN.2`.
- Nada de "refactorizar de paso", "aprovechar para limpiar" ni mejoras
  cosméticas.
- Máximo 18 misiones en total. Si salen más, prioriza y deja el resto como
  "backlog no planificado".

## Restricciones (no negociables)

- No cambiar la arquitectura, las dependencias, el esquema de la base ni los
  precios.
- No tocar prompts, fórmulas o JSON schemas marcados como cerrados.
- Ninguna misión incluye desplegar (`pnpm run deploy`).
- Respetar `.agents/rules/` y `AGENTS.md` (límite de 24 KB para `AGENTS.md`).
- Si el repositorio contradice este brief, gana el repositorio y lo anotas en
  "Supuestos".

## Formato de salida

- Markdown, español, sin emojis, sin relleno.
- Si algo es ambiguo: máximo **5 preguntas** antes de planear; si no puedes
  preguntar, escribe una lista de supuestos y sigue.
- Orden de la respuesta: (1) supuestos o preguntas, (2) índice, (3) misiones
  completas, (4) riesgos del plan (3–5), (5) cómo sabremos que funcionó
  (3 métricas).

## Antes de planear, lee en este orden

1. `AGENTS.md`
2. `readme/README.md` (§1 a §8)
3. `readme/PLANTILLA-PLAN.md`
4. `readme/estados/pendiente/18-dominio-publico.md`,
   `19-movil-sin-cortes.md`, `20-presupuesto-latencia.md`
5. `readme/analisis/argon-entrega.md` (§5, contrato de entrega)
6. El código concreto de cada misión, solo cuando la escribas.

No leas el resto del repositorio: el plan debe ser preciso, no exhaustivo.

=== PROMPT END ===
```

## Después de que Argon responda

1. Revisa que cada misión tenga un comando de aceptación y un `BLOQUEO:`
   explícito; si falta uno, devuélvela.
2. Pásale a Flash **una sola misión** por sesión, junto con `AGENTS.md`; nunca
   el índice completo.
3. Pide la salida del reporte de 10 líneas y compárala con el comando, no con la
   explicación.
4. Si Flash no cumple una misión en dos intentos, la misión está mal escrita:
   vuelve a Argon con el error exacto.
