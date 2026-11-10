/** Saved-unit contrast counts over real checks, repeats, deletion and backup/restore; no speech or providers. */
import { beforeEach, expect, test } from 'bun:test';
import i18next from 'i18next';
import data from '../src/data/minimal-pairs/pairs.json';
import en from '../src/i18n/locales/en.json';
import { emptyAnswer } from '../src/services/exercises/answer';
import { preparePairsDrills } from '../src/services/exercises/fromPairs';
import { db, deleteSetData, exportData, importData } from '../src/storage/db';
import {
  checkItem,
  clearItemState,
  countsBySoundContrast,
  deleteUnit,
  getResetToken,
  listAttempts,
  resetUnit,
  saveUnits,
} from '../src/storage/exercises';
import type { ExerciseUnit } from '../src/types/exercises';
import { MinimalPairsPackSchema } from '../src/types/minimalPairs';
import { freshDb } from './fixtures/storage';

const pack = MinimalPairsPackSchema.parse(data);
const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

beforeEach(freshDb);

async function seedPairs(setId = 'pairs') {
  let id = 0;
  const contrasts = ['y-u', 'e-ɛ', 'b-p'];
  const [unit] = preparePairsDrills({
    pack,
    contrasts,
    count: pack.pairs.filter((pair) => contrasts.includes(pair.contrast)).length,
    makeId: () => `${setId}-${++id}`,
    rng: () => 0,
    now: () => 123,
    t: i18n.t.bind(i18n),
  });
  await saveUnits([unit]);
  return unit;
}

async function check(unit: ExerciseUnit, contrast: string, correct: boolean) {
  const item = unit.items.find((item) => item.meta?.contrast === contrast)!;
  const options = item.prompt.slice(1, -1).split('|');
  const answer = correct ? String(item.expectedAnswer) : options.find((option) => option !== item.expectedAnswer)!;
  return checkItem({
    unitId: unit.id,
    itemId: item.id,
    resetToken: await getResetToken(unit.id),
    answer: { ...emptyAnswer(item), choiceSelections: [answer] },
    result: { correct, strictAccents: true },
  });
}

async function seedHandCount() {
  const first = await seedPairs('first');
  const second = await seedPairs('second');
  await check(first, 'y-u', false);
  expect((await check(first, 'y-u', true)).created).toBe(false); // Already checked: not another attempt.
  await clearItemState(first.id, first.items.find((item) => item.meta?.contrast === 'y-u')!.id, 0);
  await check(first, 'y-u', true);
  await resetUnit(first.id);
  await check(first, 'y-u', true);
  await check(first, 'b-p', false);
  await check(second, 'y-u', true);
  return { first, second };
}

const handCount = [
  { contrast: 'b-p', correct: 0, total: 1 },
  { contrast: 'y-u', correct: 3, total: 4 },
];

test('hand count includes every stored repeat, combines units and omits unattempted contrasts', async () => {
  expect(await countsBySoundContrast()).toEqual([]);
  await seedHandCount();
  expect(await listAttempts()).toHaveLength(5);
  expect(await countsBySoundContrast()).toEqual(handCount); // e-ɛ is saved but never answered.
});

test('deleting a set removes only its counts; deleting the remaining unit ignores retained orphan history', async () => {
  const { first, second } = await seedHandCount();
  await deleteSetData(first.setId);
  expect(await countsBySoundContrast()).toEqual([{ contrast: 'y-u', correct: 1, total: 1 }]);
  expect(await listAttempts()).toHaveLength(5);
  await deleteUnit(second.id);
  expect(await countsBySoundContrast()).toEqual([]);
  expect(await listAttempts()).toHaveLength(5);
});

test('attempts for a unit that never existed are ignored without error', async () => {
  await (
    await db()
  ).put('attempts', {
    id: 'orphan',
    learningArea: 'listening',
    unitId: 'missing',
    itemId: 'rue-roue',
    grammarTag: 'listening-dictation',
    prompt: '{rue|roue}',
    userAnswer: 'rue',
    expectedAnswer: 'rue',
    correct: true,
    timestamp: 1,
  });
  expect(await countsBySoundContrast()).toEqual([]);
});

test('only item metadata with the minimal-pairs source counts, not a contrast or grammar tag alone', async () => {
  const saved = await seedPairs();
  const item = saved.items.find((item) => item.meta?.contrast === 'y-u')!;
  const unit: ExerciseUnit = {
    ...saved,
    id: 'mixed-source',
    setId: 'mixed-source',
    learningArea: 'reading',
    items: [
      item,
      { ...item, id: 'other', meta: { source: 'other', contrast: 'y-u' } },
      { ...item, id: 'no-source', meta: { contrast: 'y-u' } },
      { ...item, id: 'no-meta', meta: undefined },
    ],
  };
  await saveUnits([unit]);
  for (const item of unit.items) {
    await checkItem({
      unitId: unit.id,
      itemId: item.id,
      resetToken: 0,
      answer: { ...emptyAnswer(item), choiceSelections: [String(item.expectedAnswer)] },
      result: { correct: true, strictAccents: true },
    });
  }
  expect(await listAttempts()).toHaveLength(4);
  expect(await countsBySoundContrast()).toEqual([{ contrast: 'y-u', correct: 1, total: 1 }]);
});

test('restore before deletion brings back units and counts; restore after deletion keeps orphan history uncounted', async () => {
  const { first, second } = await seedHandCount();
  const before = await exportData();
  await deleteSetData(first.setId);
  await deleteSetData(second.setId);
  const after = await exportData();
  expect(after.attempts).toHaveLength(5);
  expect(after.units).toEqual([]);
  await freshDb();
  await importData(JSON.parse(JSON.stringify(before)));
  expect(await countsBySoundContrast()).toEqual(handCount);
  await importData(JSON.parse(JSON.stringify(after)));
  expect(await listAttempts()).toHaveLength(5);
  expect(await countsBySoundContrast()).toEqual([]);
});
