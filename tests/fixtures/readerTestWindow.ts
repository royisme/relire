/** Minimal routing event target for server-render/hook tests, not a browser or a DOM implementation. */
export function readerTestWindow() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  // `src/i18n` calls the global `localStorage` at import time whenever a window exists.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      location: { hash: '' },
      relireHistory: { read: () => 0 },
      matchMedia: () => ({ matches: false }),
      clearTimeout,
      localStorage,
    }),
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  };
}
