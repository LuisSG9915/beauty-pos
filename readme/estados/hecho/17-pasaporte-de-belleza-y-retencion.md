# 17 — El Pasaporte de Belleza & Retención Predictiva (Melena Ritual: Fase 3)

**Completado:** 2026-10-08  
**Dolor resuelto:**  
- Al terminar un servicio de color, alisado o tratamiento, la clienta solo se iba con un ticket o sin ningún registro de su transformación ni guía de cuidado en casa.
- Los salones sufrían de "churn silencioso" esperando pasivamente a que la clienta recordara agendar su retoque, perdiendo de 2 a 4 semanas de ingresos recurrentes.
- Las fotografías de Antes y Después se quedaban aisladas en la ficha técnica interna sin generar valor para el cliente ni fomentar la fidelización.

---

## Lo implementado

### 1. Motor de Retención Predictiva (`src/modules/expedientes/retencion.ts` & Tests)
- Clasificación de ciclos biológicos y estéticos según servicio/fórmula:
  - **Decoloración / Balayage**: Matiz en 4 semanas (28 días). Rutina: Shampoo matizador violeta + Mascarilla ácida + Termoprotector.
  - **Coloración global / Canas**: Retoque de crecimiento en 25 días (~3.5 semanas). Rutina: Shampoo sin sulfatos + Filtro UV.
  - **Alaciados / Keratina**: Mantenimiento en 90 días (12-13 semanas). Rutina: Cero sales/sulfatos + Leave-in termo-activado.
  - **Tratamientos profundos / Hidratación**: Refuerzo en 21 días (3 semanas).
  - **Cortes y despuntes**: Mantenimiento en 35 días (5 semanas).
- **Generación de Radar de Retención**:
  - Días restantes y estados de ciclo: `a_tiempo`, `ventana_optima`, `vencido`.
  - Redacción personalizada automática para WhatsApp con enlace a reservas en línea (`wa.me/${telefono}?text=...`).
  - 8 pruebas unitarias exhaustivas en `src/modules/expedientes/retencion.test.ts`.

### 2. Componente de Comparación Táctil (`AntesDespuesSlider`)
- `src/components/antes-despues-slider.tsx`: Slider de comparación visual con recorte acelerado por hardware (`clipPath: inset(...)`).
- Soporta arrastre táctil en móviles y puntero en escritorio, manija centrada con icono de flechas, badges contrastantes "Antes" y "Después", y navegación por teclado accesible (flechas izquierda/derecha).
- Degrada limpiamente si solo hay una foto disponible.

### 3. Pasaporte de Belleza en Portal del Cliente (`/mi-cita/[token]`)
- Consulta enriquecida en `obtenerReservaPorToken` (`src/modules/reservas/gestion.ts`): vincula la ficha técnica y fotos de la cita sin comprometer datos confidenciales.
- Servidor seguro de medios (`src/app/api/medios/[...key]/route.ts`): autoriza la visualización de fotos de ficha técnica a peticiones que porten un token de reserva válido y activo de la organización.
- En la interfaz pública de la cita, se despliega:
  - **Comparador visual interactivo Antes vs. Después**.
  - **Resumen del ritual aplicado**.
  - **Prescripción de cuidado en casa** con pasos numerados.
  - **Radar de mantenimiento** con fecha ideal y botón directo de 1 toque para reagendar en línea (`/reservar/{slug}`).

### 4. Radar de Retención en el Panel de Gestión (`/admin/clientes/[id]`)
- Tarjeta destacada de "Radar de Retención Predictiva" en la pestaña de fórmulas del cliente.
- Badge cromático del estado del ciclo (verde, ámbar o rojo).
- Botón directo para enviar recordatorio personalizado por **WhatsApp** en 1 clic.
- Integración del `AntesDespuesSlider` directamente dentro del historial de fichas técnicas para revisión del estilista.

---

## Verificación realizada
- `pnpm typecheck`: 0 errores.
- `pnpm lint`: 0 advertencias, 0 errores.
- `pnpm test`: 522 pruebas pasadas en 48 suites.
- `pnpm db:check`: 100% sincronizado con Drizzle.
