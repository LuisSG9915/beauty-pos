# 16 — Modo Estación, Temporizadores de Pose y Plano Vivo (Melena Ritual: Fase 2)

**Completado:** 2026-10-08  
**Dolor resuelto:**  
- Los tiempos de pose químicos (decoloraciones, tintes, tratamientos) se controlaban de memoria o con alarmas ruidosas en teléfonos personales.  
- El plano físico del salón era un mapa de inventario estático: no mostraba qué sillones estaban ocupados en vivo, quién estaba en tiempo de pose ni quién estaba listo para cobro.  
- La recepción tenía que interrumpir al estilista para saber qué consumos o servicios se hicieron antes de cobrar el ticket.

---

## Lo implementado

### 1. Motor de Temporizadores de Pose & Audio Zen Sintetizado
- **Módulo de dominio**: `src/modules/agenda/temporizador.ts` con funciones de cálculo regresivo, formateo `mm:ss`, y persistencia en `localStorage` (`melena_pose_timers_v1`) sincronizada reactivamente vía eventos `melena:pose_timer_changed` y `storage`.
- **Acorde Armónico Web Audio API**: `reproducirAcordePose()` genera una tríada mayor armónica suave (Do5: 523Hz, Mi5: 659Hz, Sol5: 784Hz, Do6: 1046Hz) con arpegio zen y decaimiento exponencial. Cero dependencias externas, cero descargas de audio y 100% compatible offline/PWA.
- **Barra Flotante Global**: `src/components/pose-timer-bar.tsx` integrada en `admin-shell.tsx`. Muestra tarjetas flotantes para cada temporizador activo, botón de extensión rápida (+5 min), prueba de timbre, descarte y alertas nativas de navegador (`Notification API`).
- **Lanzador directo desde Recetario**: En `RecetarioEditor` (`src/components/recetario-editor.tsx`), al ingresar o seleccionar el tiempo de pose, aparece un botón directo para activar el cronómetro con un solo toque (≥44px).

### 2. El Plano Vivo: Estado de Estaciones en Tiempo Real
- **Subselect en 1 sola consulta SQL**: En `cargarPlano` (`src/modules/plano/queries.ts`), se incorporó el subselect `sesionActiva` que detecta en tiempo real citas de la fecha ligadas a los recursos de agenda de cada mueble (`cita_recursos`). No añade ningún roundtrip adicional ni penaliza la latencia de CockroachDB en Cloudflare Workers.
- **Representación Visual SVG**: `figuraMueble` en `src/app/admin/plano/plano-board.tsx`:
  - **Verde esmeralda**: Estación con servicio en curso (`en_proceso`).
  - **Ámbar pulsante**: Estación en tiempo de pose químico (con badge de minutos).
  - **Azul cielo**: Cliente listo para cobro (cita con venta generada).
  - Badge con el nombre del cliente directamente visible sobre el mueble en el mapa 2D.
- **Ficha Rápida de Estación**: `MobiliarioSheet` (`src/app/admin/plano/plano-sheets.tsx`) despliega una tarjeta destacada de "Sesión en curso" con el nombre del cliente, servicio, profesional a cargo, tiempo de pose, y botones de 1 clic para:
  - Ver cita en la agenda
  - Abrir o cobrar el ticket en el POS
  - Iniciar el cronómetro de pose

---

## Verificación realizada
- `pnpm typecheck`: 0 errores.
- `pnpm lint`: 0 advertencias, 0 errores.
- `pnpm test`: 514 pruebas pasadas (incluyendo `temporizador.test.ts` y `formulas.test.ts`).
- `pnpm db:check`: 100% consistente con Drizzle schema.
