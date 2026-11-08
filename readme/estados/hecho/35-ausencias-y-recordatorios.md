# 35 — El panel muestra las ausencias y si los recordatorios las bajan

**Prioridad:** P1 · **Depende de:** 34 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
En `/admin/reportes` (y en `/admin/mi-dia`), la dueña ve cuántas citas se
marcaron "No vino" en el período y la tasa de ausencias, para saber si los
recordatorios con enlace (misión 34) están funcionando. Hoy `citas_por_estado`
ya cuenta "no_asistio" pero no se presenta como métrica ni se compara con
períodos anteriores.

**Fuera de alcance\***
Cambiar el estado de cita, el cron de recordatorios, Brevo, migraciones de
esquema, ni tocar el envío real de recordatorios (misiones 34 y siguientes).

## Contexto verificado

- `src/modules/reportes/queries.ts` (ReporteSqlRow) — `citas_por_estado`
  ya devuelve `{ estado, total }` incluyendo `no_asistio`; la página lo
  consume para el gráfico de estados.
- `src/app/admin/reportes/page.tsx` — renderiza la tarjeta de ganancia y los
  filtros; la respuesta "¿cuánto gané?" va primero (misión 32). La sección
  de operación (citas por estado) queda después.
- `src/modules/agenda/estados.ts:21` — `no_asistio` es estado válido de cita;
  etiqueta visible "No vino".
- `src/modules/agenda/types.ts:23` — `ESTADOS_CITA_INACTIVOS` incluye
  `no_asistio`.
- `src/lib/glosario.ts` — vocabulario único; "ausencia" debe sonar llano.

## Diseño decidido

- **Métrica pura** (helper en `src/modules/reportes/` o función local):
  `tasaAusencias = no_asistio / (completadas + no_asistio)` clamp a 0 si
  denominador 0; reportar `no_asistio`, `total_citas_cerradas`,
  `tasaAusencias` y la misma cifra del período anterior para el delta.
- **UI**: en la sección de operación del reporte, una tarjeta "Citas que no
  se presentaron" con la cifra y el porcentaje, con hint "vs período
  anterior" reutilizando `deltaKpi`/`etiquetaDelta` (`rules.ts:48-81`).
- **Sin consultas nuevas**: reutilizar `citas_por_estado` ya cargado.
- **Fuera de alcance de esta misión**: desglose por profesional ( queda para
  una misión posterior si hace falta).

## Pasos

1. `src/modules/reportes/rules.ts` (o nuevo helper) — función pura de tasa
   de ausencias + prueba.
2. `src/app/admin/reportes/page.tsx` — tarjeta en la sección de operación,
   antes de los gráficos detallados.
3. Prueba unitaria del cálculo (denominador 0, redondeo, delta).

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `/admin/reportes` muestra "Citas que no se presentaron" con número y
      porcentaje en ambos viewports.
- [ ] Sin citas cerradas → 0 %, sin división por cero.
- [ ] `pnpm test:usability --only=reportes` → 0 errores nuevos.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev
pnpm test:usability --only=reportes
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 6 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- `citas_por_estado` no incluye `no_asistio` en el rango filtrado.
- La página de reportes no carga la sección de operación sin permiso
  `reportes.operativos`.

## Reporte (al terminar)

```
Misión: 35 — Ausencias y efecto de los recordatorios
Cambios: src/modules/reportes/rules.ts → derivarAusencias (+ AusenciasReporte) y prueba; src/app/admin/reportes/page.tsx → KPI "Citas que no se presentaron" con tasa y delta vs periodo anterior (sin consulta nueva).
Verificación: typecheck ✔ | lint ✔ | test 604 ✔ (2 pruebas nuevas) | usability 0 errores (desktop y móvil) | db:check n/a
Antes → después: solo gráfico de estados → KPI con número, porcentaje y comparativo
Desviaciones: (1) el denominador es completadas + no_asistio (las canceladas se excluyen), según el diseño. (2) la tasa se muestra como porcentaje entero.
Riesgo abierto: ninguno en reportes. Falta validar con datos reales que el número coincida con la operación del salón.
```

## Desviaciones (las escribe el implementador)

ninguna
