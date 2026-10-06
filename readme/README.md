# Melena — Plan de mejora de la aplicación

Índice del plan de trabajo, respuestas a las preguntas del encargo y orden de ejecución
para SWE-2 MAX. Fecha del diagnóstico: 2026-10-05. Repo: `LuisSG9915/beauty-pos`
(marca del producto: **Melena**). Nota: "lecta" en el encargo se refiere a otro repo
del dueño (`LuisSG9915/lecta`, lector EPUB); este es `beauty-pos`, no se renombra nada.

## Respuestas a las preguntas

### ¿Empezar desde cero o mejorar este proyecto?

**Mejorar este.** Lo que ya existe y funciona es lo difícil y lento de reconstruir:

- Auth (Better Auth) con roles, permisos y alcance por sucursal (`resolveAccessSafe`).
- Agenda con staff, servicios, horarios, bloqueos y recursos por cita.
- POS completo: pagos, anticipos, paquetes, membresías, promociones, devoluciones,
  cancelaciones, ticket.
- Caja (arqueos, diferencias de corte), comisiones, facturación, gastos.
- Inventario básico (`inventario_stock`, `movimientos_inventario`).
- PWA con venta offline (`public/sw.js`, `src/modules/offline`).
- Telemetría propia, pipeline de incidentes, 50 migraciones, suite de tests y
  scripts de perf/usabilidad/smoke.

Lo que molesta hoy (campos redundantes, tablas pobres, cero animaciones, sucursal
que no se recuerda, UX de ventas) es **capa de UX**, y se arregla sobre lo que ya
hay sin tocar la base. Empezar de cero repetiría meses de trabajo ya resuelto.

### ¿Migrar a Expo?

**No, ahora no.** La app ya es una PWA instalable y vende sin conexión. Con Expo
tendrías una segunda base de código (React Native) que mantener en paralelo.
Para la cámara (foto de producto, ticket de compra) basta el input web
`capture="environment"`. Expo solo valdría la pena si en el futuro se necesita
impresora Bluetooth/NFC nativa o presencia en App Store/Google Play.
Detalle: `readme/analisis/expo-vs-pwa.md`.

### ¿Migrar la BD a D1?

**No migrar ahora.** D1 es SQLite y el código depende de Postgres en ~140 puntos
(`jsonb_*`, `::numeric`, `for update`, transacciones, `at time zone`); el contexto
admin y la agenda están optimizados con subselects `jsonb` fusionados. Migrar
implicaría reescribir esquema Drizzle + 50 migraciones + las consultas críticas
de cobro/caja, por un tope de 10 GB por base y rendimiento de un solo hilo.

Costo en Workers Paid ($5/mes): 25 mil millones de filas leídas, 50 M escritas y
5 GB incluidos; para el volumen de un salón sería prácticamente $0 adicionales.
El único ahorro real sería lo que hoy cuesta CockroachDB. Alternativa barata si
CockroachDB se encarece: otro Postgres gestionado (Neon/Supabase) detrás del mismo
Hyperdrive, sin reescribir nada.
Detalle: `readme/analisis/d1-vs-cockroach.md`.

### Otros servicios de Cloudflare a usar

| Servicio | Para qué | Fase |
|---|---|---|
| **R2** | Fotos de productos/servicios, tickets, fichas antes/después | 07, 08, 10 |
| **Images** | Redimensionar y miniaturas on-the-fly | 07 |
| **Workers AI** | Visión: leer foto de producto y ticket de compra | 08, 10, 12 |
| **AI Gateway** | Caché, límites y logs de las llamadas a IA | 08, 10, 12 |
| **Queues / Workflows** | Descartado por ahora: el análisis del ticket corre en la misma petición (más simple con OpenNext) | backlog |
| **Cron Triggers** | No necesario: la alerta "por agotarse" se calcula al leer el tablero | backlog |
| **Turnstile** | Proteger `/reservar` público de bots | backlog |
| **Durable Objects** | Agenda en tiempo real multi-recepcionista (opcional, futuro) | backlog |

Detalle: `readme/analisis/cloudflare-servicios.md`.

## Qué existe y qué falta (verificado en código, oct-2026)

| Pedido | Estado |
|---|---|
| Clave + nombre redundantes | Existe. `clave` obligatoria en ~15 catálogos con único `(org, clave)` |
| Sucursal en ventas no se recuerda | Confirmado. `admin-context.ts` solo lee `?sucursalId`; si falta usa `branches[0]`. El POS la pide en un `<Select required>` |
| Animaciones | Casi nada: sheets/diálogos sí animan; `tw-animate-css` importado sin uso; tarjetas y listas aparecen de golpe |
| Agenda | Ya tiene arrastrar (solo mouse), clic en hueco para crear, línea de "ahora", colores por profesional y diálogo mover con sugerencias. Falta: arrastre táctil, vista previa al arrastrar, movimiento instantáneo, deshacer, cambiar duración arrastrando |
| Organización / sucursales | Registro ya crea negocio + "Sucursal principal"; con 1 negocio ya no se muestra selector. Lo confuso: selectores de sucursal por pantalla, "Sucursal principal" genérico, asignación de equipo en dos lugares con regla invisible ("sin asignación = ve todas") |
| Gráficas | Parcial: `src/components/charts.tsx` ya tiene `BarChart` SVG propio (sin dependencias) usado en reportes; falta pastel/donut y uso en inventario |
| Foto de producto/servicio | No existe. `FileDropzone` solo acepta CSV (importación de clientes); `fotos jsonb` en fichas técnicas no tiene almacenamiento detrás |
| IA para leer fotos | No existe |
| Compras / proveedores | No existe. La pestaña "Proveedores e historial" del producto es relleno; gastos guardan el proveedor como texto |
| Inventario | Base sí (stock + movimientos + tabla); faltan gráficas, valorización y vista multi-sucursal |
| Vitrinas/pisos/mapa | No existe |
| Muebles | Parcial: `recursos` (cabina/silla/equipo) solo sirven a la agenda; sin registro de mobiliario |
| Reporte de qué comprar / "buena compra" | No existe |

## Estructura de esta carpeta

```
readme/
  README.md          ← este índice
  analisis/          decisiones de arquitectura (d1, expo, cloudflare)
  estados/
    pendiente/       planes listos para ejecutar
    en-progreso/     el plan que está corriendo SWE-2 MAX (máximo 1)
    hecho/           planes terminados con verificación en verde
```

**Flujo de estados:** pasar a SWE-2 MAX **un solo plan a la vez** para no saturar
contexto. Al asignarlo, mover el archivo `pendiente/` → `en-progreso/`. Cuando la
verificación quede en verde (`verificacion.md`), mover `en-progreso/` → `hecho/`.
Si un plan falla a mitad, queda en `en-progreso/` con una nota `BLOQUEO:` al final.

## Orden de ejecución y modelo recomendado por fase

**Todos los planes tienen el diseño cerrado** (revisión a fondo del 2026-10-05):
esquemas, firmas, prompts de IA, JSON schemas, fórmulas y casos de prueba ya están
escritos. **Toda la implementación la hace SWE-2 MAX**; no hace falta una fase de
Opus. Reglas para el implementador:

- No cambiar prompts, JSON schemas, fórmulas ni umbrales marcados como cerrados.
  Si algo no encaja con el código real, detenerse y anotar `BLOQUEO:` en el plan.
- Si una suposición del plan resulta falsa al leer el código, seguir el código real
  y anotarlo al final del plan ("Desviaciones").
- **Opus 5.5** solo se usa si aparece un `BLOQUEO:` que exija rediseño.
- **GPT 6.1 / SWE-2 normal** opcional para el plan 04 (mecánico).

| # | Plan | Modelo | Depende de |
|---|---|---|---|
| 01 | `01-sucursal-persistente-y-pos.md` | SWE-2 MAX | — |
| 02 | `02-clave-automatica.md` | SWE-2 MAX | — |
| 03 | `03-alta-rapida-productos-servicios.md` | SWE-2 MAX | 02 |
| 04 | `04-columnas-tablas.md` | SWE-2 MAX (o GPT 6.1) | — |
| 05 | `05-animaciones-y-agenda.md` | SWE-2 MAX | — |
| 06 | `06-sucursales-organizaciones-simple.md` | SWE-2 MAX | 01, 02 |
| 07 | `07-imagenes-r2.md` | SWE-2 MAX | 03 |
| 08 | `08-captura-ia-desde-foto.md` | SWE-2 MAX | 03, 07 |
| 09 | `09-inventario-dashboard.md` | SWE-2 MAX | — |
| 10 | `10-compras-con-ticket.md` | SWE-2 MAX | 07, 08 |
| 11 | `11-ubicaciones-mapa-y-mobiliario.md` | SWE-2 MAX | 07 (09 recomendado) |
| 12 | `12-reabastecimiento-y-buena-compra.md` | SWE-2 MAX | 08 (IA opcional), 10 (en camino) |

Orden sugerido: 01 → 02 → 03 → 05 → 06 → 04 → 07 → 08 → 09 → 10 → 12 → 11.
Las fases 01–03 dan el alivio inmediato. Los planes 08, 10 y 11 requieren pasos
manuales del dueño en Cloudflare (crear bucket R2 / AI Gateway): están listados en
cada plan.

## Convenciones que TODO plan debe respetar

- Reglas del proyecto: `.windsurf/rules/arquitectura.md` y `verificacion.md`
  (typecheck, lint, test; `test:usability` si toca UI admin; `db:check` si toca
  esquema; `test:smoke` si toca agenda/cobro/caja).
- Nada que capture conexión DB en un `global`: usar `getRequestScope()`.
- Escrituras a `suscripciones`/`planes` invalidan KV. Otros módulos nuevos con
  datos fríos pueden usar `kvReadThrough`/`kvInvalidate` (`src/lib/kv-cache.ts`).
- Permisos en server actions con `checkPermission`/`requirePermission` +
  `assertBranchScope`; nunca fiarse del cliente.
- `data-action-id` en acciones; `data-action-clave="1"` en la acción primaria.
- Vocabulario de `src/lib/glosario.ts`; sin UUIDs visibles.
- Deploy solo con `pnpm run deploy`.
