/** Minimal routing event target for server-render/hook tests, not a browser or a DOM implementation. */
export function readerTestWindow() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      location: { hash: '' },
      relireHistory: { read: () => 0 },
      matchMedia: () => ({ matches: false }),
      clearTimeout,
      // `src/i18n` reads the language preference at import time under this window, so it must exist.
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    }),
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  };
}
