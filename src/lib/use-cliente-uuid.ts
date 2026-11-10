"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * UUID generado solo en el cliente, seguro para hidratar.
 *
 * `useState(() => crypto.randomUUID())` rompe la hidratación cuando el valor
 * llega al HTML (input hidden, atributo, prop): el servidor y el cliente
 * generan UUIDs distintos y React reporta "A tree hydrated but some
 * attributes didn't match". Aquí el servidor y el primer render del cliente
 * ven "" (snapshot de servidor) y React relee el snapshot real al montar —
 * el mismo patrón que `useSyncExternalStore` en theme-mode-selector.
 *
 * Devuelve `[id, regenerar]`: los schemas de acciones aceptan "" (`z.literal`
 * o `.optional()`), y el formulario no puede enviarse antes de hidratar.
 * `regenerar()` emite un UUID nuevo (p. ej. tras guardar, para que la
 * siguiente ficha/foto no reutilice la PK).
 */
export function useClienteUuid(): [string, () => void] {
  // Store por instancia: el ref se crea una sola vez (también en SSR, donde
  // solo se usa el snapshot de servidor).
  const storeRef = useRef<{ id: string; listeners: Set<() => void> } | null>(null);
  if (storeRef.current === null) {
    storeRef.current = { id: "", listeners: new Set() };
  }
  const store = storeRef.current;

  const subscribe = useCallback(
    (onChange: () => void) => {
      store.listeners.add(onChange);
      return () => {
        store.listeners.delete(onChange);
      };
    },
    [store],
  );

  const getSnapshot = useCallback(() => {
    if (!store.id) store.id = crypto.randomUUID();
    return store.id;
  }, [store]);

  const getServerSnapshot = useCallback(() => "", []);

  const id = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const regenerar = useCallback(() => {
    store.id = crypto.randomUUID();
    store.listeners.forEach((listener) => listener());
  }, [store]);

  return [id, regenerar];
}
