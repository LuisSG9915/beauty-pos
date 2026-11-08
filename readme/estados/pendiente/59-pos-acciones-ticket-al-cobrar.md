# 59 — POS: acciones del ticket durante el flujo de cobro

**Prioridad:** P1 · **Depende de:** 58 (opcional, para variante imagen) ·
**Tiempo estimado:** ≤ 1.5 h · **Archivos previstos:** ≤ 4

**Objetivo**
Durante una venta "en proceso", la columna derecha muestra las acciones del
comprobante (imprimir preliminar + enviar por WhatsApp de texto) encima del
formulario de cobro, en lugar de aparecer solo tras cobrar. El ticket impreso se
marca como "PRELIMINAR".

**Fuera de alcance**
No se cambia la lógica de cobro ni de `CobroForm`. No se añade generación de
imagen (eso es la misión 58; aquí solo texto, como hoy). No se toca el modal
post-cobro.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:973-983` — renderiza `CobroForm` si `editable`
  (sin `TicketActionsBar`).
- `src/app/admin/pos/venta-ticket.tsx:1000-1048` — renderiza `TicketActionsBar`
  solo en el bloque "Venta cobrada con éxito" (estado completada).
- `src/app/admin/pos/printable-ticket.tsx:39-57` — firma de `TicketActionsBar`
  (`PrintableTicketProps`), sin prop `preliminar`.

## Diseño decidido

- Añadir prop `preliminar?: boolean` a `TicketActionsBar`:
  - Botón imprimir cambia a "Imprimir preliminar".
  - El bloque imprimible muestra "PRELIMINAR — no válido como comprobante fiscal"
    en el encabezado.
  - WhatsApp sigue enviando el mensaje de texto actual (sin cambios).
- En `venta-ticket.tsx`, cuando `editable`, renderizar
  `<TicketActionsBar preliminar ... />` encima de `<CobroForm>`.

## Pasos

1. `src/app/admin/pos/printable-ticket.tsx` — añadir prop `preliminar` a
   `PrintableTicketProps` y a `TicketActionsBar`; ajustar etiqueta del botón y
   encabezado del bloque imprimible.
2. `src/app/admin/pos/venta-ticket.tsx` — renderizar `TicketActionsBar` con
   `preliminar` encima de `CobroForm` cuando `editable`.
3. Verificación manual: imprimir desde una venta en proceso muestra "PRELIMINAR".

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] En una venta en proceso se ven los botones Imprimir/WhatsApp arriba del
      formulario de cobro.
- [ ] Imprimir desde una venta en proceso muestra "PRELIMINAR" en el comprobante.
- [ ] `pnpm test:usability` → 0 errores (acción primaria sigue siendo "Cobrar").

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev + recorrido manual
# pnpm test:usability
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1.5 h de agente |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El bloque imprimible "PRELIMINAR" rompe el formato 80 mm o el CSS de impresión.
- Añadir `TicketActionsBar` en proceso duplica la acción primaria (debe seguir
  siendo solo "Cobrar" con `data-action-clave="1"`).

## Reporte (al terminar)

```
Misión: 59 — acciones del ticket al cobrar
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <acciones solo post-cobro → también durante el cobro>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
