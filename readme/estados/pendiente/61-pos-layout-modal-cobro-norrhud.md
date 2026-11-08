# 61 — POS: layout del modal de cobro al estilo norhud (G4)

**Prioridad:** P2 · **Depende de:** 60 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo**
Reorganizar `CobroForm` al layout norhud sin cambiar la lógica de pagos/propina/
idempotencia: total arriba-izquierda con propina arriba-derecha, campo "Recibido"
con "X" para borrar, chips "Exacto/$500/$1,000", cambio destacado, botones
"Volver (Esc)" y "Cobrar (Enter)".

**Fuera de alcance**
No se cambia la lógica de pagos, propina, idempotencia ni acumulación de billetes.
No se toca el shell admin ni otras pantallas. No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/cobro-form.tsx:212-493` — JSX completo del `CobroForm`.
- `src/app/admin/pos/cobro-form.tsx:226-238` — encabezado actual (título + total).
- `src/app/admin/pos/cobro-form.tsx:240-279` — propina actual (chips Sin/10/15/20/Otro).
- `src/app/admin/pos/cobro-form.tsx:290-437` — pagos, billetes, input monto, cambio.
- `src/app/admin/pos/cobro-form.tsx:473-491` — CTA pegado al fondo.

## Diseño decidido

- Reordenar el JSX existente para que coincida con el flujo norhud (arriba→abajo):
  1. Encabezado: "Cobrar" (izq) + total grande (der) + propina (der-arriba).
  2. Selector de propina en fila de chips: "No" (seleccionado), "10%", "15%",
     "20%", "Otra".
  3. Medios de pago como pestañas/chips horizontales: Efectivo/Tarjeta/Transferencia/Mixto.
  4. "Recibido": input grande con "$" a la izq y "X" a la der; chips "Exacto",
     "$500", "$1,000" debajo; numpad a la derecha (de la misión 60).
  5. "Cambio": campo grande con el cambio calculado.
  6. Botones finales: "Volver (Esc)" (contorno) + "Cobrar $X (Enter)" (mostaza).
- Atajos de teclado: Esc → cancelar/cerrar, Enter → submit (si `puedeCobrar`).
  Reutilizar `useEffect` con `keydown` (no romper la accesibilidad del diálogo).
- Mantener `data-action-clave="1"` únicamente en el botón "Cobrar".

## Pasos

1. `cobro-form.tsx` — reordenar JSX al layout norhud (sin tocar lógica).
2. `cobro-form.tsx` — añadir atajos Esc/Enter vía `useEffect`.
3. `cobro-form.tsx` — añadir "X" para borrar en el input de monto (llama a
   `borrarMonto`).
4. Verificación: `pnpm test:usability` (axe + objetivos ≥ 24 px) y
   `pnpm test:perf` sin regresión > 10 %.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] El layout coincide visualmente con la captura norhud (total, propina, medios,
      recibido, cambio, botones).
- [ ] Esc cierra/cancela, Enter envía si `puedeCobrar`.
- [ ] `pnpm test:usability` → 0 errores.
- [ ] `pnpm test:perf` → sin regresión > 10 % en las rutas POS.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:usability
pnpm test:perf
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El reordenamiento rompe la lógica de acumulación de billetes o idempotencia.
- `test:usability` reporta más de 1 error nuevo de layout-movil.
- `test:perf` muestra regresión > 10 % en POS.

## Reporte (al terminar)

```
Misión: 61 — layout modal cobro norhud
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores | perf sin regresión
Antes → después: <layout actual → layout norhud>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
