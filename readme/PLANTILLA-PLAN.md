# Plantilla de misión (para Argon)

Copia este archivo a `readme/estados/pendiente/NN-nombre-corto.md` y completa
todas las secciones. Una misión que no cabe en una sesión se parte en dos.
Las secciones marcadas con `*` son obligatorias: si falta una, el agente debe
detenerse y pedirla.

---

# NN — <Resultado en una frase, sin jerga>

**Prioridad:** P0 | P1 | P2 · **Depende de:** <NN | —> ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
<Qué cambia para la persona que usa el sistema, en una o dos frases. Debe poder
observarse: "al cobrar desde la agenda ya no se pide la sucursal", no "mejorar
el POS".>

**Fuera de alcance\***
<Lo que NO se toca. Ejemplos: otros módulos, rediseños, dependencias nuevas,
migraciones destructivas, deploy.>

## Contexto verificado\*

<Archivos y líneas reales, con una frase de qué hace hoy cada uno. Sin "busca
en el repo". Si algo no coincide al abrir el archivo, el agente anota `BLOQUEO:`
y se detiene.>

- `ruta/archivo.ts:NN` — <qué hace hoy>.
- `ruta/otro.tsx:NN` — <qué hace hoy>.

## Diseño decidido (si aplica)

<Decisiones ya tomadas que el agente NO debe reinventar: nombres de cookie,
forma de la URL, esquema, fórmula, prompt, umbral. Si no hay, borrar la
sección.>

## Pasos

1. <Archivo exacto> — <cambio concreto>.
2. <Archivo exacto> — <cambio concreto>.
3. <Prueba nueva o actualizada> — <qué cubre>.

## Criterios de aceptación\*

<Comandos y resultados observables. Sin criterios subjetivos.>

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → <N> pruebas en verde.
- [ ] <Comando específico> → <salida esperada>.
- [ ] <Recorrido manual> → <qué se ve>.

## Verificación

<Solo lo que aplique, según §7 del plan maestro. Si una verificación no puede
correr en el entorno, se reporta como limitación; no se omite.>

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm db:check        (si toca src/db/schema)
# pnpm test:usability  (si toca UI; requiere pnpm dev)
# pnpm test:perf       (si toca datos o navegación)
# pnpm test:smoke      (si toca agenda, cobro, caja o auth)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- Hace falta una acción manual del dueño (Cloudflare, R2, AI Gateway, DNS).
- El cambio excede el alcance o los archivos previstos.

## Reporte (al terminar)

```
Misión: NN — <nombre>
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | db:check ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
