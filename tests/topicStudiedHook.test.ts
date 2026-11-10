/** Subscription, stale-load and real-error probes for studied marks, with disposable storage and no DOM. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { useTopicStudied } from '../src/hooks/useTopicStudied';
import * as storage from '../src/storage/topicStudied';
import { readerHookProbe } from './fixtures/readerHookProbe';
import { freshDb, failure } from './fixtures/storage';
import type { TopicStudied } from '../src/types/topicStudied';

let probe: ReturnType<typeof readerHookProbe>;
let restore: (() => void)[];
beforeEach(async () => {
  await freshDb();
  probe = readerHookProbe();
  restore = [];
});
afterEach(() => {
  probe.restore();
  for (const undo of restore.reverse()) undo();
});
const draw = () => probe.render(useTopicStudied);
async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(5);
  expect(done()).toBe(true);
}

test('reads and subscribes to committed marks, stamps Date.now and propagates unmark', async () => {
  await storage.markTopicStudied('test-initial', 100);
  draw();
  probe.effects();
  await until(() => draw().studied.has('test-initial'));
  const clock = spyOn(Date, 'now').mockReturnValue(1234);
  restore.push(() => clock.mockRestore());
  await draw().mark('test-next');
  expect(await storage.listTopicStudied()).toContainEqual({ topicId: 'test-next', at: 1234 });
  expect(draw().studied.has('test-next')).toBe(true);
  await draw().unmark('test-next');
  expect(draw().studied.has('test-next')).toBe(false);
});

test('a newer subscription refresh wins over an older initial read, and unmount discards late reads', async () => {
  const loads: ((rows: TopicStudied[]) => void)[] = [];
  const list = spyOn(storage, 'listTopicStudied').mockImplementation(
    () => new Promise((resolve) => loads.push(resolve)),
  );
  restore.push(() => list.mockRestore());
  draw();
  probe.effects();
  const refresh = storage.topicStudiedChanged();
  loads[1]([{ topicId: 'test-new', at: 2 }]);
  await refresh;
  loads[0]([{ topicId: 'test-old', at: 1 }]);
  await Bun.sleep(0);
  expect([...draw().studied]).toEqual(['test-new']);
  const pending = storage.topicStudiedChanged();
  probe.restore();
  let lateReads = 0;
  loads[2]([
    {
      get topicId() {
        lateReads++;
        return 'test-late';
      },
      at: 3,
    },
  ]);
  await pending;
  expect(lateReads).toBe(0);
  await storage.topicStudiedChanged();
  expect(list).toHaveBeenCalledTimes(3);
});

test('read errors retain their real message and failed writes reject to the caller', async () => {
  const list = spyOn(storage, 'listTopicStudied').mockRejectedValue(new Error('TEST read denied'));
  const mark = spyOn(storage, 'markTopicStudied').mockRejectedValue(new Error('TEST mark denied'));
  const unmark = spyOn(storage, 'unmarkTopicStudied').mockRejectedValue(new Error('TEST unmark denied'));
  restore.push(
    () => list.mockRestore(),
    () => mark.mockRestore(),
    () => unmark.mockRestore(),
  );
  draw();
  probe.effects();
  await until(() => draw().error === 'TEST read denied');
  expect(await failure(draw().mark('test-one'))).toEqual(new Error('TEST mark denied'));
  expect(await failure(draw().unmark('test-one'))).toEqual(new Error('TEST unmark denied'));
});
