/** Minimal routing event target for server-render/hook tests, not a browser or a DOM implementation. */
export function readerTestWindow() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      location: { hash: '' },
      relireHistory: { read: () => 0 },
      matchMedia: () => ({ matches: false }),
      clearTimeout,
    }),
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  };
}
