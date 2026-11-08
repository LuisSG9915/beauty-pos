# 53 — Pantalla de inicio del POS: elegir qué aparece o no

**Prioridad:** P1 · **Depende de:** 52 · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
Al iniciar la prueba/el punto de venta, la dueña ve una pantalla con tarjetas activables (como las capturas de Northud: "Agenda y citas", "Cobro y caja", "Ventas y tienda", "Clientes y marketing", "Página y presencia", "Caja", "Impresión", "Gastos") para elegir qué aparece o no. Al guardar, se redirige al POS con solo lo activado.

**Fuera de alcance\***
Rediseño del cobro (misión 54), look and feel (misión 55), deploy.

## Contexto verificado\*

- `src/modules/onboarding/types.ts:26-33` — `PasoClave` y `PasoGuia`: patrón de paso con `clave`, `titulo`, `descripcion`, `href`, `permisos`, `opcional`, `completado`. Sirve de referencia para las tarjetas de características.
- `src/modules/onboarding/rules.ts:149-212` — `PACKS_ARRANQUE_MEXICO`: referencia de cómo se agrupan servicios por tipo de negocio (estética, barbería, unas, pestañas).
- `src/modules/pos/caracteristicas.ts` (misión 52) — `CARACTERISTICAS_POS` y helpers para leer/escribir la configuración por organización.
- `src/app/admin/pos/page.tsx:193-346` — `PosIndex`: vista actual de entrada al POS ("Cobrar", venta rápida, ventas de hoy) a la que se redirige tras guardar la selección.

## Diseño decidido (si aplica)

- Nueva ruta de entrada al POS, p. ej. `/admin/pos/inicio` (o reutilizar `/pos` cuando no hay configuración previa), que renderiza las tarjetas de características como toggles.
- Cada tarjeta: ícono, etiqueta, descripción breve y toggle (activado/desactivado). Estado inicial desde `configuracion_pos` de la organización; si no hay fila, defaults de `CARACTERISTICAS_POS`.
- Botón de acción primaria ("Guardar y continuar" / "Abrir punto de venta") que persiste la selección (misión 52) y redirige a `/pos` con solo las características activas.
- Telemetría: `data-action-id="pos.inicio.guardar"` y `data-action-clave="1"` en el botón primario.

## Pasos

1. `src/app/admin/pos/inicio/page.tsx` (o equivalente) — pantalla de selección de características con tarjetas toggle y botón primario.
2. `src/components/admin/pos/tarjeta-caracteristica.tsx` — componente reutilizable de tarjeta con ícono, etiqueta, descripción y toggle.
3. `src/app/admin/pos/inicio/actions.ts` — acción de servidor que guarda la selección y devuelve la URL de retorno al POS.
4. Ajuste en `src/app/admin/pos/page.tsx` — cuando no exista configuración previa, redirigir a la pantalla de inicio en lugar de mostrar el POS completo.
5. Prueba nueva para la acción de guardado (persiste y redirige).

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → pruebas de la misión en verde.
- [ ] Recorrido manual: entrar al POS sin configuración → ver tarjetas toggle → desactivar "Caja" e "Impresión" → guardar → el POS solo muestra lo activado.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm test:usability  (si toca UI; requiere pnpm dev)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- La misión 52 no está terminada y verificada (falta `cargarConfiguracionPos`/`guardarConfiguracionPos`).
- El código real contradice el "Contexto verificado".
- Hace falta una migración o un secreto.

## Reporte (al terminar)

```
Misión: 53 — Pantalla de inicio del POS: elegir qué aparece o no
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
