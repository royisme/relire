/**
 * The retry-with-the-same-payload save shared by the drill form and the Conjugation page's button: a failed save
 * keeps the prepared units, a changed input drops them, one save runs at a time. Runs on fake-indexeddb. Owns the
 * saver's state only, not the hook around it or the drills.
 */
import { beforeEach, expect, test } from 'bun:test';
import { createUnitSaver } from '../src/hooks/useUnitSaver';
import { listUnits, saveUnits } from '../src/storage/exercises';
import { failure, freshDb } from './fixtures/storage';
import { ITEMS, unitOf } from './fixtures/units';

beforeEach(freshDb);

const batch = (setId: string) => [{ ...unitOf('FILL_BLANKS', [ITEMS.FILL_BLANKS]), id: `${setId}:a`, setId }];

test('a failed save keeps the prepared units: the retry saves the same batch without preparing again', async () => {
  let prepared = 0;
  const prepare = () => {
    prepared++;
    return batch('set-a');
  };
  await saveUnits(batch('set-a')); // the id is taken, so every save of this batch is refused
  const saver = createUnitSaver();
  expect(await failure(saver.run(prepare))).toBeInstanceOf(Error);
  expect(await failure(saver.run(prepare))).toBeInstanceOf(Error);
  expect(prepared).toBe(1);
});

test('a retry that can now save commits the very units the first press prepared', async () => {
  const first = batch('set-b');
  let failing = true;
  const saver = createUnitSaver(async (units) => {
    if (failing) throw new Error('disk full');
    await saveUnits(units);
  });
  const prepare = () => (failing ? first : batch('set-other'));
  expect(((await failure(saver.run(prepare))) as Error).message).toBe('disk full');
  failing = false;
  const saved = await saver.run(prepare);
  expect(saved).toBe(first);
  expect((await listUnits()).map((unit) => unit.id)).toEqual(['set-b:a']);
});

test('drop makes the next run prepare afresh', async () => {
  let prepared = 0;
  const saver = createUnitSaver(async () => {
    throw new Error('no');
  });
  const prepare = () => {
    prepared++;
    return batch('set-c');
  };
  await failure(saver.run(prepare));
  saver.drop();
  await failure(saver.run(prepare));
  expect(prepared).toBe(2);
});

test('a success clears the payload, and a second run while one is saving is ignored', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const saver = createUnitSaver(async () => {
    calls++;
    await gate;
  });
  const running = saver.run(() => batch('set-d'));
  expect(await saver.run(() => batch('set-e'))).toBeUndefined();
  release();
  expect((await running)?.[0].setId).toBe('set-d');
  expect(calls).toBe(1);
  let prepared = 0;
  await saver.run(() => {
    prepared++;
    return batch('set-f');
  });
  expect(prepared).toBe(1);
});
