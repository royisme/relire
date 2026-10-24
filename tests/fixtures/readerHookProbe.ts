/** DOM-free hook probe for graded-reader lifecycle tests; namespace spies are restored, never module mocks. */
import * as React from 'react';
import { spyOn } from 'bun:test';

export function readerHookProbe() {
  let cursor = 0;
  const slots: unknown[] = [];
  const effects: {
    callback: React.EffectCallback;
    deps?: React.DependencyList;
    prior?: React.DependencyList;
    cleanup?: () => void;
    changed: boolean;
  }[] = [];
  let effectCursor = 0;
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[at],
      (next: unknown) => {
        slots[at] = typeof next === 'function' ? next(slots[at]) : next;
      },
    ];
  }) as typeof React.useState);
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const at = cursor++;
    if (!(at in slots)) slots[at] = { current: initial };
    return slots[at];
  }) as typeof React.useRef);
  const effect = spyOn(React, 'useEffect').mockImplementation((callback, deps) => {
    const at = effectCursor++;
    const prior = effects[at];
    const changed = !prior || !deps || deps.some((value, index) => !Object.is(value, prior.prior?.[index]));
    effects[at] = { ...prior, callback, deps, changed };
  });
  const layout = spyOn(React, 'useLayoutEffect').mockImplementation(() => undefined);
  const memo = spyOn(React, 'useMemo').mockImplementation((calculate) => calculate());
  const callback = spyOn(React, 'useCallback').mockImplementation((fn) => fn);
  const store = spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, snapshot, server) =>
    (server ?? snapshot)(),
  );
  return {
    render: <T>(render: () => T): T => {
      cursor = 0;
      effectCursor = 0;
      return render();
    },
    effects: () => {
      for (const entry of effects) {
        if (!entry.changed) continue;
        entry.cleanup?.();
        entry.cleanup = entry.callback() ?? undefined;
        entry.prior = entry.deps;
        entry.changed = false;
      }
    },
    restore: () => {
      for (const entry of effects) entry.cleanup?.();
      for (const spy of [state, ref, effect, layout, memo, callback, store]) spy.mockRestore();
    },
  };
}
