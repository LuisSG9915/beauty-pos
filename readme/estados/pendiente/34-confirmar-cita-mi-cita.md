# 34 — La clienta confirma su cita desde el enlace del correo

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
La clienta abre `/mi-cita/[token]` (el enlace que ya llega en los correos)
y toca "Confirmar mi cita": la cita pasa de pendiente a confirmada, el
salón la ve confirmada en la agenda y la probabilidad de ausencia baja —
el KPI del salón.

**Fuera de alcance\***
Recordatorios por WhatsApp o SMS, encuestas post-cita, cambios al correo
(Brevo), migraciones de esquema, revocar o regenerar tokens de gestión.

---

## Contexto verificado

- Citas del panel nacen `pendiente` (`src/app/admin/agenda/actions.ts:354`);
  las reservas web nacen `autoConfirmar ? "confirmada" : "pendiente"` y el
  auto-confirmar exige la capacidad `reservas_auto_confirmar`
  (`src/modules/reservas/service.ts:142,230`). Hoy solo el equipo marca
  "Confirmar" a mano (`TRANSICION_LABEL` en `src/modules/agenda/estados.ts:104`).
- `/mi-cita/[token]`: `actions.ts:18-44` expone consultar, slots,
  cancelar y reagendar; `gestion-panel.tsx:41+` ya pide teléfono para
  cancelar/reagendar; `ReservaGestionPublica.estado` ya viaja al cliente
  (`src/modules/reservas/gestion.ts:252,371`).
- Tokens de autogestión: en BD solo el hash SHA-256
  (`src/db/schema/operations.ts:1064-1080`); el claro solo existe al
  emitirse (`emitirTokenGestion`, `gestion.ts:61-79`) → **el cron no
  puede reconstruir `gestionUrl`**.
- Correos: confirmación y cambio sí llevan `gestionUrl`
  (`agenda/actions.ts:393-402`, `gestion.ts:595`); el recordatorio que
  encola el cron se inserta **sin `detalle`**
  (`src/modules/notificaciones/service.ts` ~líneas 231-249) → la
  plantilla cae a "comunícate con el negocio" (`aviso-email.ts:146`).
- Patrones a reutilizar en `gestion.ts`: `reservaPorHash`,
  `puedeGestionarCita`, `telefonoCoincide`, `registrarHistorialCita`,
  `auditEvent`, rate limit `reserva_manage`, tipo `GestionResult`;
  `reagendarReservaPublica` (`gestion.ts:488-612`) es el molde.
- `encolarAvisoCita` (`service.ts:44-103`) es idempotente por
  `(citaId, tipo, versionCita)`, calcula `programadoPara` del recordatorio
  sola y omite los que ya vencieron → llamarlo al crear es seguro.

## Diseño decidido

1. **`confirmarReservaPublica(token, telefono)`** en
   `src/modules/reservas/gestion.ts` — espejo de
   `cancelarReservaPublica`/`reagendarReservaPublica`: token 64-hex,
   `reservaPorHash`, rate limit `reserva_manage`, `telefonoCoincide`,
   `puedeGestionarCita`. Reglas:
   - `estado='confirmada'` → `{ ok: true }` idempotente ("ya estaba
     confirmada").
   - `estado` distinto de `pendiente`/`confirmada` → error llano.
   - Update `estado='confirmada'` **sin incrementar `version`**: la fecha
     no cambia y el recordatorio ya encolado sigue siendo válido.
   - `registrarHistorialCita` (`accion:'confirmada'`, `origen:'web'`) +
     `auditEvent` (`cita.confirmada_web`) + correo `TIPO_CONFIRMACION`
     al cliente por el patrón `avisoDiferido`/`enviarAvisoDiferido`.
2. **`confirmarMiCita`** en `src/app/mi-cita/[token]/actions.ts` y botón
   primario "Confirmar mi cita" (`min-h-11`,
   `data-action-id="mi_cita.confirmar"`) en `GestionPanel` cuando
   `reserva.estado === "pendiente"` y `reserva.gestionable`; si ya está
   confirmada se muestra el estado sin botón. Reutilizar el input de
   teléfono existente.
3. **Recordatorio con enlace** (sin migraciones ni cleartext en BD):
   - En `agenda/actions.ts` al crear cita: tras `emitirTokenGestion`,
     encolar también `TIPO_RECORDATORIO` vía `encolarAvisoCita` con
     `gestionUrl` — el productor del cron hará `onConflictDoNothing` por
     `(cita,tipo,version)` y el recordatorio temprano (con enlace) gana.
   - En `reservas/service.ts` (reserva web): igual tras emitir el token.
   - En `reagendarReservaPublica`: para la nueva versión, encolar el
     recordatorio con `gestionUrl: urlGestion(token)` (el claro sí existe
     ahí).
   - Edición de panel que cambia fecha: la nueva versión queda sin
     enlace (el claro no es recuperable) — limitación aceptada, anotarla
     en Desviaciones/Riesgo abierto.

## Pasos

1. `src/modules/reservas/gestion.ts` — `confirmarReservaPublica`.
2. `src/app/mi-cita/[token]/actions.ts` + `gestion-panel.tsx` — acción y
   botón/estado.
3. `src/app/admin/agenda/actions.ts` y `src/modules/reservas/service.ts`
   — encolar `TIPO_RECORDATORIO` con `gestionUrl` tras emitir token.
4. `src/modules/reservas/gestion.ts` (`reagendarReservaPublica`) —
   recordatorio de la nueva versión con `gestionUrl`.
5. Pruebas: decisión de confirmación (extraer función pura si hace
   falta) + camino feliz/error/idempotente con la infraestructura de
   mocks existente.

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `/mi-cita/[token]` de una cita `pendiente` muestra "Confirmar mi
      cita"; tras confirmar, la agenda la muestra `confirmada` y queda
      correo de confirmación encolado.
- [ ] Cita creada desde la agenda → su fila de recordatorio encolado
      lleva `detalle.gestionUrl` (verificable en BD o test).
- [ ] Cita ya `confirmada` → respuesta idempotente; cita `cancelada` →
      error llano; rate limit `reserva_manage` aplica igual que cancelar.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev   # recorrido manual: /mi-cita/<token> con cita pendiente
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 8 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Confirmar exige tocar `version` para que `decidirAviso` trate bien el
  recordatorio encolado (ver `src/modules/notificaciones/rules.ts`).
- `telefonoCoincide` no aplica al flujo de confirmación y la política de
  la sucursal no está clara.
- El encolado anticipado del recordatorio rompe la idempotencia del
  productor del cron.

## Reporte (al terminar)

```
Misión: 34 — La clienta confirma su cita desde el enlace del correo
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔
Antes → después: solo cancelar/cambiar desde /mi-cita → confirmar en 1 toque
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
