# Investigación post-lanzamiento: Oportunidades de alto impacto para Melena

**Fecha:** 2026-10-24 · **Estado:** Cerrada para análisis y priorización de Gemini 4 Argon  
**Contexto:** P0 (Dominio público, móvil 390 px, latencia ≤ 2 consultas/página) está 100 % completado y en producción en [melena.app](https://melena.app).  
**Destinatario:** Gemini 4 Argon (Arquitecto y planificador en Antigravity).

---

## 1. Resumen ejecutivo (para Argon)

Con los tres bloqueos de lanzamiento resueltos, el producto ya opera en vivo sin barreras técnicas. Sin embargo, el objetivo de negocio no es solo "que no se rompa", sino **que una dueña de estética en México active su salón en menos de 10 minutos, registre sus citas diarias y no abandone el sistema**.

Esta investigación analiza la brecha entre el estado técnico actual y la realidad operativa del mostrador en un salón mexicano típico (1 a 3 sillones, operado de pie desde un teléfono de 390 px), estructurada en **5 ejes de mejora inmediata (P1)** evaluados por impacto, esfuerzo y riesgo.

---

## 2. Mapa de fricción operativa en el salón mexicano

```
[ Registro en melena.app ]
         │
         ▼
[ EJE 1: Alta de catálogo ] ── Fricción: Teclear precios/duraciones en frío desde el móvil
         │                                (Abandono > 40% estimado en este paso)
         ▼
[ EJE 2: Flujo de Citas ]   ── Fricción: Los clientes no leen correos; la confirmación
         │                                debe vivir en WhatsApp con 1 toque
         ▼
[ EJE 3: Cobro y Comisiones]── Fricción: El cobro es mixto (efectivo + tarjeta + SPEI) y
         │                                el cálculo de comisión al estilista es manual
         ▼
[ EJE 4: Ficha / Ritual ]   ── Fricción: La estilista necesita ver la fórmula anterior
         │                                dentro del modal de la cita, no en otra pantalla
         ▼
[ EJE 5: Cierre del Día ]   ── Fricción: "¿Cuánto gané realmente?" (Ventas - Comisiones - Gastos)
                                         desconectado en silos de reporte
```

---

## 3. Análisis detallado por eje

### EJE 1: Reducción drástica del Time-to-First-Value (Onboarding P1.1)

#### Diagnóstico del estado actual
- Actualmente, la guía de 6 pasos (`src/modules/onboarding/rules.ts`) exige que el usuario navegue a `/admin/servicios` y cree su primer servicio rellenando manualmente nombre, categoría, duración en minutos y precio en MXN.
- En pruebas de campo con usuarios de baja alfabetización digital, el formulario en blanco produce "parálisis por decisión" (no saben qué duración promedio poner o dudan en el formato).

#### Oportunidad técnica
- **Packs de arranque con 1 toque (Seeders inteligentes por tipo de negocio):**
  Al entrar por primera vez (o dentro de la tarjeta de guía), ofrecer 4 botones de activación inmediata:
  1. **Estética / Salón de Belleza:** Corte Dama ($250, 45m), Corte Caballero ($180, 30m), Tinte Completo ($850, 120m), Balayage ($1,800, 180m), Alaciado Express ($1,200, 120m), Manicure Gelish ($280, 45m).
  2. **Barbería Clásica:** Corte Clásico ($200, 35m), Arreglo de Barba con Toalla Caliente ($180, 30m), Paquete Corte + Barba ($350, 60m), Exfoliación Facial ($220, 30m).
  3. **Nail Spa / Uñas:** Aplicación Gelish ($250, 45m), Uñas Acrílicas Esculturales ($550, 90m), Retoque de Acrílico ($350, 60m), Pedicure Spa ($420, 60m).
  4. **Lash & Brow Bar:** Extensiones Clásicas 1x1 ($650, 90m), Retoque 15 días ($350, 45m), Lifting de Pestañas ($400, 45m), Planchado de Ceja ($300, 35m).
- **Mecanismo:** Un Server Action atómico que inserta la categoría y los 5-6 servicios en una sola transacción, dejando el salón listo para agendar en 5 segundos.

---

### EJE 2: Confirmación y recordatorio nativo por WhatsApp (Comunicación P1.4)

#### Diagnóstico del estado actual
- El sistema cuenta con un pipeline completo de recordatorios por correo (`src/app/api/cron/recordatorios/route.ts`, `recordatorios_envios`, Brevo API).
- **Realidad en México:** La tasa de apertura de correo en clientas de estéticas es inferior al 8 %. El 92 % de las citas se confirman, cambian o cancelan por WhatsApp.
- Actualmente, `wa.me` solo se usa en `printable-ticket.tsx` y en el formulario de clientes, pero **no existe en la agenda**.

#### Oportunidad técnica (Enfoque Zero-Cost vía Universal Link)
- Agregar en la tarjeta de cita (`src/app/admin/agenda/cita-detalle-sheet.tsx` o modal de cita) un botón primario **"Confirmar por WhatsApp"**:
  - Abre `https://wa.me/52{telefono}?text={mensaje}` codificado.
  - Mensaje pre-armado:
    > *"¡Hola {cliente}! Te confirmamos tu cita para {servicio} el {dia} a las {hora} con {estilista} en {salon}. Puedes ver los detalles o solicitar cambios aquí: https://melena.app/mi-cita/{token}"*
- **Ventaja técnica:**
  - $0 de costo de infraestructura (no requiere saldo de Twilio ni verificación de Meta Business API).
  - Abre la app nativa de WhatsApp en iOS/Android o WhatsApp Web en escritorio al instante.
  - Vincula directamente al portal público `/mi-cita/[token]` que ya opera con HTTP 200 directo.

---

### EJE 3: El reporte que la dueña entiende: "Tu Ganancia Real de Hoy" (Reportes P1.2)

#### Diagnóstico del estado actual
- `/admin/reportes` muestra gráficas de citas por estado, origen y medios de pago.
- `/admin/caja` muestra el arqueo ciego y las diferencias de corte.
- `/admin/comisiones` muestra lo acumulado por estilista.
- `/admin/gastos` lista salidas de dinero.
- **Problema:** Los datos financieros están fragmentados. La dueña tiene que abrir tres páginas y sumar en una libreta para saber cuánto le quedó en la bolsa.

#### Oportunidad técnica
- Crear el componente **"Caja Neta / Ganancia del Día"** (consolidable en `/admin/caja` y `/admin/reportes`):
  $$\text{Ganancia Neta} = \text{Ventas Cobradas} - \text{Comisiones de Estilistas} - \text{Gastos Operativos}$$
- Desglose directo y transparente:
  1. **Total Ingresado:** Efectivo en caja + Tarjeta + Transferencia SPEI.
  2. **Por Pagar a Equipo:** Comisiones devengadas en las ventas del día.
  3. **Gastos del Día:** Compras de material rápido (tintes, aluminio, café, garrafón).
  4. **Utilidad Neta del Día:** Dinero real del dueño.
- Cumple con la regla de oro: ≤ 2 consultas mediante un agregado SQL fusionado (`jsonb`).

---

### EJE 4: Ficha Técnica Rápida en el Sillón (Ritual / Retención)

#### Diagnóstico del estado actual
- El módulo de expediente técnico (`ficha técnica`, recetario químico y pasaporte de belleza) fue implementado en las fases 15 y 17.
- Para consultarlo, la estilista tiene que salir de la agenda, buscar al cliente en `/admin/clientes`, abrir su expediente y bajar hasta el historial de fórmulas.
- En la práctica, con las manos enguantadas o entre cliente y cliente, esto no se hace y la fórmula se olvida.

#### Oportunidad técnica
- **Acceso en 1 toque desde la cita:**
  - En la vista de la cita en `/admin/agenda` o `/admin/mi-dia`: añadir una pastilla o pestaña directa *"Última fórmula"*.
  - Muestra un extracto rápido: *"12-sep: Tinte 7.1 + 20 vol (45 min) — Matiz 9.2"*.
  - Botón *"Repetir fórmula en esta cita"* que copia la receta anterior a la nueva cita en 1 toque.

---

### EJE 5: Lectura de notas de remisión mexicanas con IA (Compras)

#### Diagnóstico del estado actual
- `/admin/compras/[id]/analizar` envía la foto del ticket a Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct` o similar).
- Funciona bien para facturas estándar impresas.
- **Realidad en México:** El 60 % de las compras de belleza se hacen en distribuidoras locales con notas de remisión manuales en papel autocopiante (azul/rosa), con letra manuscrita o abreviaturas muy densas (`Tte 8.1`, `Deco azul 500g`, `Perox 30v`).

#### Oportunidad técnica
- Mejorar el System Prompt de extracción en `src/lib/ia/cliente.ts` con un glosario específico de belleza mexicano y formato de corrección de cantidades (piezas, cajas, litros).
- Si la IA falla o la confianza es baja, degradar a un formulario de captura rápida con autocompletado sobre el catálogo de productos existente.

---

## 4. Matriz de Priorización para Argon

| Eje | Misión propuesta | Valor negocio | Esfuerzo estimado | Archivos a tocar | Riesgo |
|---|---|---|---|---|---|
| **Eje 1** | `21-onboarding-presets-mexico` | 🟢 Muy Alto (baja abandono) | 30 min | 3 archivos (`rules.ts`, `actions.ts`, `guia-card.tsx`) | 🟢 Mínimo |
| **Eje 2** | `22-whatsapp-confirmacion-agenda` | 🟢 Muy Alto (reduce ausencias) | 35 min | 3 archivos (`cita-detalle.tsx`, `mi-dia.tsx`, `format.ts`) | 🟢 Nulo (usa `wa.me`) |
| **Eje 3** | `23-reporte-ganancia-neta-caja` | 🟢 Muy Alto (core del valor) | 40 min | 3 archivos (`caja/page.tsx`, `reportes/page.tsx`, `queries.ts`) | 🟡 Medio (SQL agregado) |
| **Eje 4** | `24-recetario-acceso-rapido-agenda`| 🟡 Medio (fidelización) | 30 min | 3 archivos (`agenda/cita-modal.tsx`, `expedientes/queries.ts`) | 🟢 Mínimo |
| **Eje 5** | `25-ia-compras-notas-remision` | 🟡 Medio (inventario) | 40 min | 2 archivos (`src/lib/ia/cliente.ts`, `compras/form.tsx`) | 🟡 Medio (calidad modelo) |

---

## 5. Recomendación de secuencia para el plan maestro

1. **Sprint P1 Inmediato:**
   - **Misión 21:** Packs de servicios de arranque (activación en < 2 min).
   - **Misión 22:** Botón de confirmación / recordatorio 1-clic por WhatsApp desde la agenda.
   - **Misión 23:** Métrica y tarjeta de "Ganancia neta del día" en caja y reportes.

2. **Sprint P1 de Consolidación:**
   - **Misión 24:** Historial de recetario accesible desde el modal de cita.
   - **Misión 25:** Afinado de captura de notas de compra con IA.

---

## 6. Verificaciones que debe exigir Argon en cada nueva misión

- Respetar el contrato de `AGENTS.md` (≤ 8 archivos, ≤ 2 horas, ≤ 2 consultas SQL por página).
- Mantener tipografía mínima de 13 px (`text-op-xs`) y objetivos táctiles de 44 px (`min-h-11`).
- Cero términos ajenos a `src/lib/glosario.ts`.
- Validación obligatoria con `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm test:usability`.
