/** Hook regression probes with stepped React hooks and real isolated exercise transactions. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import * as React from 'react';
import * as storage from '../src/storage/exercises';
import { useExerciseUnit, type ExerciseUnitSession } from '../src/hooks/useExerciseUnit';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import { learningFixture } from './fixtures/grammarLearning';
import { answered, freshDb } from './fixtures/storage';

const choice = (value: string) => ({ ...answered(''), choiceSelections: [value] });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let render: () => ExerciseUnitSession;
let cleanup: (() => void) | undefined;
let restore: (() => void)[];
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(async () => {
  await freshDb();
  const topic = learningFixture();
  const unit = topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const slots: unknown[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const state = spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[index],
      (next: unknown) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      },
    ];
  }) as typeof React.useState);
  const ref = spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    return (slots[index] ??= { current: initial });
  }) as typeof React.useRef);
  const callback = spyOn(React, 'useCallback').mockImplementation((fn) => fn);
  const effect = spyOn(React, 'useEffect').mockImplementation((fn, deps) => {
    const index = cursor++;
    const previous = slots[index] as React.DependencyList | undefined;
    if (!deps || !previous || deps.some((value, i) => value !== previous[i])) {
      slots[index] = deps;
      effects.push(() => {
        const result = fn();
        if (result) cleanup = result;
      });
    }
  });
  restore = [
    () => state.mockRestore(),
    () => ref.mockRestore(),
    () => callback.mockRestore(),
    () => effect.mockRestore(),
  ];
  // Match useCallback's dependency identity so the load effect does not restart on each stepped render.
  callback.mockImplementation((fn, deps) => {
    const index = cursor++;
    const previous = slots[index] as { fn: typeof fn; deps: React.DependencyList } | undefined;
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) slots[index] = { fn, deps };
    return (slots[index] as { fn: typeof fn }).fn;
  });
  render = function useSession() {
    cursor = 0;
    const result = useExerciseUnit(unit.id, { preparedUnit: unit, onMissingKey() {} });
    const pending = effects;
    effects = [];
    pending.forEach((run) => run());
    return result;
  };
  await until(() => render().status === 'ready');
});
afterEach(async () => {
  cleanup?.();
  cleanup = undefined;
  await tick();
  restore.reverse().forEach((fn) => fn());
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});
async function until(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error('Hook did not reach the expected state');
}
function holdNextEnsure() {
  const entered = deferred();
  const release = deferred();
  const ensure = storage.ensureTopicUnit;
  const spy = spyOn(storage, 'ensureTopicUnit').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return ensure(...args);
  });
  restore.push(() => spy.mockRestore());
  return { entered: entered.promise, release: release.resolve };
}
function watchDraftWrites() {
  const spy = spyOn(storage, 'saveItemProgress');
  restore.push(() => spy.mockRestore());
  return spy;
}

test('Redo invalidates an in-flight draft awaiting ensure and does not restore its pre-Redo answer', async () => {
  let session = render();
  const id = session.unit!.items[0].id;
  session.setAnswer(id, choice('hiver'));
  const held = holdNextEnsure();
  const writes = watchDraftWrites();
  // Flush the pending draft exactly as pagehide does; it is now absent from the debounce map.
  window.dispatchEvent(new Event('pagehide'));
  await held.entered;
  await render().check(id);
  await render().resetItem(id);
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  session = render();
  expect(writes).not.toHaveBeenCalled();
  expect((await storage.getUnitSnapshot(session.unit!.id)).states).toEqual([]);
  expect(session.items[id].answer).toEqual(choice(''));
  expect(session.canReset).toBe(false);
});

test('a committed Check cancels the pending 350ms draft timer', async () => {
  const session = render();
  const id = session.unit!.items[0].id;
  const writes = watchDraftWrites();
  session.setAnswer(id, choice('été'));
  await render().check(id);
  await new Promise((resolve) => setTimeout(resolve, 380));
  expect(writes).not.toHaveBeenCalled();
  expect(render().items[id].checked?.correct).toBe(true);
});

test('a committed Check invalidates a draft already awaiting ensure', async () => {
  const session = render();
  const id = session.unit!.items[0].id;
  session.setAnswer(id, choice('été'));
  const held = holdNextEnsure();
  const writes = watchDraftWrites();
  window.dispatchEvent(new Event('pagehide'));
  await held.entered;
  await render().check(id);
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(writes).not.toHaveBeenCalled();
  expect(render().items[id].checked?.correct).toBe(true);
});

for (const action of ['draft', 'check'] as const) {
  test(`canReset stays enabled during a second ${action} write after working state is persisted`, async () => {
    let session = render();
    expect(session.canReset).toBe(false);
    session.setAnswer(session.unit!.items[0].id, choice('été'));
    await render().check(session.unit!.items[0].id);
    session = render();
    expect(session.canReset).toBe(true);
    const id = session.unit!.items[2].id;
    session.setAnswer(id, choice('hiver'));
    const held = holdNextEnsure();
    const pending = action === 'check' ? render().check(id) : undefined;
    if (action === 'draft') window.dispatchEvent(new Event('pagehide'));
    await held.entered;
    const canReset = render().canReset;
    held.release();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(canReset).toBe(true);
  });
}
