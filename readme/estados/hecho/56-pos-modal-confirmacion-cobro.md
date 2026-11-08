# 56 — Modal de confirmación post-cobro: ticket por WhatsApp, imprimir, copiar, enlace, nueva venta

**Prioridad:** P1 · **Depende de:** 54 · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
Después de cobrar, aparece un modal de confirmación (tipo Northud) que muestra el monto cobrado, ofrece enviar el ticket por WhatsApp (selector de país + teléfono + botón Enviar), y cuatro acciones rápidas: Imprimir, Copiar, Enlace, Ver venta. Cierra con un botón primario "Nueva venta" para empezar otra venta sin fricción.

**Fuera de alcance\***
Envío real de WhatsApp (se integra con el módulo de notificaciones existente), generación de PDF de impresión, deploy.

## Contexto verificado\*

- `src/app/admin/pos/cobro-form.tsx:1-60` — formulario de cobro actual (propina, pago dividido, faltante/cambio): disparador del modal tras `cobrarVenta`.
- `src/app/admin/pos/actions.ts` — `cobrarVenta`: acción de servidor que confirma el cobro y devuelve datos de la venta.
- `src/modules/notificaciones/` — módulo existente de notificaciones (para futuro envío real por WhatsApp).
- `src/app/admin/pos/venta-ticket.tsx` — vista de ticket existente que puede reutilizarse para "Ver venta".
- `src/lib/glosario.ts` — vocabulario del salón (sin jerga técnica, sin UUIDs visibles).

## Diseño decidido (si aplica)

- Modal de confirmación post-cobro: título "Venta #N", check verde, monto cobrado, estado "Cobrado · sin cambio" (o con cambio si aplica).
- Sección "Enviar ticket por WhatsApp": selector de país (default +52 México), campo de teléfono, botón "Enviar" con `data-action-id="pos.cobro.whatsapp"` y `data-action-clave="1"`.
- Fila de 4 acciones rápidas: Imprimir (`data-action-id="pos.cobro.imprimir"`), Copiar (`data-action-id="pos.cobro.copiar"`), Enlace (`data-action-id="pos.cobro.enlace"`), Ver venta (`data-action-id="pos.cobro.ver"`).
- Botón primario grande "Nueva venta" con atajo Enter (`data-action-id="pos.cobro.nueva_venta"`, `data-action-clave="1"`): cierra el modal y abre una venta nueva en la misma sucursal.
- Cierre con X y click fuera.
- Diseño adaptativo: objetivo táctil ≥ 24 px, texto mínimo `text-op-xs` (13 px), fondo claro y botón primario en amarillo/ámbar.

## Pasos

1. `src/components/admin/pos/modal-confirmacion-cobro.tsx` — componente del modal con monto, WhatsApp, 4 acciones y botón Nueva venta.
2. Integración en `cobro-form.tsx` (o `venta-ticket.tsx`): tras `cobrarVenta` exitoso, abrir el modal con los datos de la venta cobrada.
3. Acciones de los 4 botones rápidos (imprimir, copiar enlace, ver venta) y el botón Nueva venta (redirige a `/pos?nueva=1`).
4. Prueba nueva del modal (se abre tras cobro, los botones ejecutan su acción, Nueva venta redirige).

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → pruebas existentes + nuevas del modal en verde.
- [ ] Recorrido manual: cobrar una venta → aparece modal con monto → "Nueva venta" abre una venta nueva → WhatsApp, Imprimir, Copiar, Enlace y Ver venta responden sin error.

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

- Misión 54 no verificada (falta el cobro que dispara el modal).
- Hace falta una migración, un secreto o una dependencia nueva (envío real de WhatsApp queda para el módulo de notificaciones).

## Reporte (al terminar)

```
Misión: 56 — Modal de confirmación post-cobro: ticket por WhatsApp, imprimir, copiar, enlace, nueva venta
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
