# 62 — POS: cobro en modal separado (estilo norhud)

**Prioridad:** P1 · **Depende de:** 58, 59 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 4

**Objetivo**
Al pulsar el botón "Cobrar" del ticket, se abre un <Dialog> centrado (fondo oscuro semitransparente que desenfoca el POS) con el formulario de cobro: total, propina, medios de pago, monto recibido con chips y numpad, cambio, y botones "Volver (Esc)" / "Cobrar $X (Enter)". Tras cobrar con éxito se cierra el modal y se muestra la confirmación post-cobro existente. Esto ahorra espacio en la columna derecha del ticket y coincide con las capturas norhud.

**Fuera de alcance**
No se cambia la lógica de pagos, propina, idempotencia ni acumulación de billetes. No se añaden dependencias. No se toca el shell admin ni otras pantallas. El modal post-cobro (`ModalConfirmacionCobro`) ya existe y se reutiliza.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:973-1010` — renderiza `TicketActionsBar` (misión 59) y `<CobroForm>` inline cuando `editable`. No hay estado de modal de cobro.
- `src/app/admin/pos/cobro-form.tsx:212-493` — `CobroForm` con CTA pegado al fondo (`sticky bottom-0`) y botón final `data-action-clave="1"`. No recibe `onClose` ni sabe si está en un Dialog.
- `src/components/admin/pos/modal-confirmacion-cobro.tsx:1-261` — modal post-cobro existente (estilo norhud): éxito, WhatsApp, imprimir, copiar, enlace, nueva venta.

## Diseño decidido

- `venta-ticket.tsx`: estado `cobroAbierto`. Cuando `editable`, la columna derecha muestra `TicketActionsBar` (preliminar) + botón "Cobrar" (trigger, mostaza, ancho completo) que abre el `<Dialog>`. Dentro del Dialog va `<CobroForm enDialog onClose>`.
- `cobro-form.tsx`: props `enDialog?: boolean` y `onClose?: () => void`. Quitar el wrapper `sticky bottom-0` del CTA; dejar los botones finales (Volver + Cobrar) al final del flujo del form. Añadir `useEffect` con `keydown`: Esc → `onClose()`, Enter → submit si `puedeCobrar`. El botón final conserva `data-action-clave="1"`.

## Pasos

1. `src/app/admin/pos/venta-ticket.tsx` — importar Dialog components; añadir estado `cobroAbierto`; reemplazar `<CobroForm>` inline por botón trigger + `<Dialog>` con `<CobroForm enDialog onClose>`.
2. `src/app/admin/pos/cobro-form.tsx` — añadir props `enDialog`/`onClose`; quitar sticky del CTA; añadir atajo Esc; mantener botón Cobrar como acción primaria.
3. `src/lib/ticket-imagen.test.ts` — sin cambios (ya pasa).
4. Verificación manual: abrir venta en proceso, pulsar Cobrar, verificar modal centrado, campos y botones.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] Al pulsar "Cobrar" en una venta en proceso se abre un <Dialog> centrado con el formulario de cobro.
- [ ] Esc cierra el modal sin cobrar; Enter confirma si `puedeCobrar`.
- [ ] `pnpm test:usability --viewport=movil` → 0 errores en `/admin/pos`.
- [ ] `pnpm test` → pruebas en verde.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev + recorrido manual (móvil 390px)
# pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El reordenamiento de `cobro-form.tsx` rompe la acumulación de billetes o la idempotencia.
- `test:usability` reporta errores de layout-movil en `/admin/pos`.
- El Dialog no se abre o no cierra con Esc.

## Reporte (al terminar)

```
Misión: 62 — cobro en modal norhud
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <cobro inline en columna → modal centrado al pulsar Cobrar>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
