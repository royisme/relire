import { beforeEach, expect, test } from 'bun:test';
import { answered, article, failure, freshDb, right, seedUnit, wrong } from './fixtures/storage';
import { ITEMS } from './fixtures/units';
import { EMPTY_STATS, exportData, importData, loadData } from '../src/storage/db';
import {
  ExerciseBackupError,
  StaleResetError,
  checkItem,
  getResetToken,
  listAttempts,
  listItemStates,
  listUnits,
  saveItemProgress,
  subscribeExercises,
} from '../src/storage/exercises';

beforeEach(freshDb);

const FIRST = ITEMS.FILL_BLANKS.id;

/** A library with one checked item and one wrong attempt, exported as plain JSON like a backup file. */
async function backupWithData() {
  const unit = await seedUnit();
  await checkItem({ unitId: unit.id, itemId: FIRST, resetToken: 0, answer: answered('es'), result: wrong });
  return JSON.parse(JSON.stringify(await exportData())) as Awaited<ReturnType<typeof exportData>>;
}

const snapshot = async () => JSON.stringify(await exportData());

test('export carries units, item states and attempts and no keys', async () => {
  const backup = await backupWithData();
  expect(backup.units).toHaveLength(1);
  expect(backup.itemStates).toHaveLength(1);
  expect(backup.attempts).toHaveLength(1);
  expect(JSON.stringify(backup)).not.toMatch(/apiKey/i);
});

test('a backup restores into an empty database with everything intact', async () => {
  const backup = await backupWithData();
  await freshDb();
  await importData(backup);
  expect(await snapshot()).toBe(JSON.stringify(backup));
  expect((await loadData())?.articles).toEqual([]);
});

for (const strictAccents of [false, true]) {
  test(`backup round-trips checked accent metadata ${String(strictAccents)}`, async () => {
    const backup = await backupWithData();
    const checked = { correct: false, strictAccents };
    backup.itemStates[0].checked = checked;
    await freshDb();
    await importData(backup);
    expect((await exportData()).itemStates[0].checked).toEqual(checked);
  });
}

test('a backup without the exercise keys keeps the current exercise data', async () => {
  const backup = await backupWithData();
  const { units: _u, itemStates: _s, attempts: _a, ...old } = backup;
  await importData(old);
  expect(await listUnits()).toHaveLength(1);
  expect(await listItemStates('unit-set-1')).toHaveLength(1);
  expect(await listAttempts()).toHaveLength(1);
});

test('empty arrays clear the exercise data', async () => {
  const backup = await backupWithData();
  await importData({ ...backup, units: [], itemStates: [], attempts: [] });
  expect(await listUnits()).toEqual([]);
  expect(await listItemStates('unit-set-1')).toEqual([]);
  expect(await listAttempts()).toEqual([]);
});

test('malformed exercise data rejects the whole restore and changes nothing', async () => {
  const backup = await backupWithData();
  const before = await snapshot();
  const [state] = backup.itemStates;
  const [attempt] = backup.attempts;
  const [unit] = backup.units;
  const bad: Record<string, Record<string, unknown>> = {
    'units not a list': { units: {} },
    'unit without items': { units: [{ ...unit, items: [] }] },
    'unit with an unknown tag': { units: [{ ...unit, grammarTags: ['nope'] }] },
    'duplicate unit ids': { units: [unit, unit] },
    'unit without a set id': { units: [{ ...unit, setId: undefined }] },
    'unit without a level': { units: [{ ...unit, level: undefined }] },
    'unit with an unknown level': { units: [{ ...unit, level: 'C2' }] },
    'state with a wrong key': { itemStates: [{ ...state, id: 'x' }] },
    'state with a missing field': { itemStates: [{ ...state, answer: undefined }] },
    'checked accents metadata is not boolean': {
      itemStates: [{ ...state, checked: { correct: false, strictAccents: 'yes' } }],
    },
    'state of an unknown unit': {
      itemStates: [{ ...state, unitId: 'ghost', id: `ghost:${state.itemId}` }],
    },
    'state of an unknown item': { itemStates: [{ ...state, itemId: 'ghost', id: `${state.unitId}:ghost` }] },
    'attempt with an unknown tag': { attempts: [{ ...attempt, grammarTag: 'old-category' }] },
    'attempt without a verdict': { attempts: [{ ...attempt, correct: 'yes' }] },
    'duplicate attempt ids': { attempts: [attempt, attempt] },
  };
  for (const [name, patch] of Object.entries(bad)) {
    const rejected = await importData({ ...backup, ...patch }).then(
      () => false,
      (err: unknown) => err instanceof ExerciseBackupError,
    );
    expect({ name, rejected }).toEqual({ name, rejected: true });
    expect(await snapshot()).toBe(before);
  }
});

test('a state pointing at a stored unit that does not exist aborts the transaction, articles included', async () => {
  const backup = await backupWithData();
  const before = await snapshot();
  const [state] = backup.itemStates;
  // No `units` key, so the reference is checked against the stored rows inside the transaction.
  expect(
    await failure(
      importData({
        articles: [article('replacement')],
        itemStates: [{ ...state, unitId: 'ghost', id: `ghost:${state.itemId}` }],
      }),
    ),
  ).toBeInstanceOf(ExerciseBackupError);
  expect(await snapshot()).toBe(before);
});

test('replacing the articles leaves units, their states and attempts untouched', async () => {
  const backup = await backupWithData();
  const before = await snapshot();
  await importData({ articles: [article('other')], vocab: [], stats: { ...EMPTY_STATS } });
  expect(await listUnits()).toHaveLength(1);
  expect(await listItemStates('unit-set-1')).toHaveLength(1);
  expect(await listAttempts()).toHaveLength(backup.attempts.length);
  expect(JSON.parse(await snapshot()).units).toEqual(JSON.parse(before).units);
});

test('a restore invalidates writers that started before it, and tells listeners', async () => {
  const backup = await backupWithData();
  const token = await getResetToken('unit-set-1');
  let calls = 0;
  const stop = subscribeExercises(() => calls++);
  await importData(backup);
  expect(calls).toBe(1);
  expect(await failure(saveItemProgress('unit-set-1', FIRST, token, {}))).toBeInstanceOf(StaleResetError);
  // A restore without exercise keys but with the same articles leaves tokens alone.
  const fresh = await getResetToken('unit-set-1');
  const { units: _u, itemStates: _s, attempts: _a, articles: _articles, ...rest } = backup;
  await importData(rest);
  expect(await getResetToken('unit-set-1')).toBe(fresh);
  stop();
});

test('a unit restored over a checked item keeps the backup state, not the old one', async () => {
  const backup = await backupWithData();
  const unit = backup.units[0];
  await checkItem({
    unitId: unit.id,
    itemId: ITEMS.FILL_BLANKS_MULTI.id,
    resetToken: await getResetToken(unit.id),
    answer: answered('x'),
    result: right,
  });
  await importData(backup);
  expect((await listItemStates(unit.id)).map((s) => s.itemId)).toEqual([FIRST]);
  expect(await listAttempts()).toHaveLength(1);
});
