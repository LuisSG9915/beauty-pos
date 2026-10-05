# Análisis: ¿migrar a Expo (React Native)?

Conclusión: **no por ahora**. La web/PWA cubre lo que el salón necesita; Expo sería
una segunda app que mantener sin beneficio inmediato.

## Lo que ya tienes sin Expo

- **PWA instalable**: `public/manifest.webmanifest` + `public/sw.js` + módulo
  offline (`src/modules/offline`: IndexedDB + cola de sincronización). El
  recepcionista la "instala" en el teléfono como app.
- **Venta sin conexión**: `offline-cache.tsx`, `offline-actions.ts`,
  `venta-offline.ts` con tests.
- **Cámara**: `<input type="file" accept="image/*" capture="environment">` abre la
  cámara del teléfono para la foto de producto o ticket. No hace falta app nativa.
- **Push**: Web Push funciona en Android/desktop (en iOS PWA está limitado pero
  existe desde iOS 16.4).

## Qué ganaría Expo (y cuánto importa hoy)

| Ganaría | ¿Lo necesitas ya? |
|---|---|
| Impresora térmica Bluetooth/USB | Solo si imprimes ticket físico; hoy el ticket es digital |
| NFC / hardware nativo | No hay caso de uso actual |
| Presencia en App Store / Google Play | Comercial, no técnico |
| Mejor soporte push en iOS | Menor; hay avisos por correo (Brevo) |
| Acceso nativo a galería/archivos | Ya cubierto por input web |

## Qué costaría

- Segunda base de código (React Native + Expo) o rewrite de `src/app` entero.
- Mantener dos UX (web para admin/reportes, nativa para POS) o duplicar pantallas.
- Distribución: cuentas de tienda, builds EAS, revisiones de Apple/Google.
- Los tests de usabilidad/perf/smoke actuales (Puppeteer) no aplican a nativo.

## Recomendación

1. Mantén la PWA y mejora la UX (fases 01–06 del plan).
2. Fotos/tickets por input con `capture` (fases 07, 08, 10).
3. Si aparece un requisito nativo duro (impresora Bluetooth es el más probable),
   evalúa primero una PWA con Web Bluetooth/WebUSB antes de dar el salto a Expo.
   La regla global del proyecto ya pide no compilar nativo salvo necesidad real.
