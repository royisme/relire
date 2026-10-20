/** TEST-only topic lifecycle: real isolated transactions; no content service, AI or speech. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, failure, answered, right } from './fixtures/storage';
import { learningFixture } from './fixtures/grammarLearning';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import {
  checkItem,
  clearItemState,
  deleteUnit,
  ensureTopicUnit,
  getUnitSnapshot,
  listAttempts,
  listItemStates,
  listUnits,
  resetUnit,
  saveItemProgress,
  StaleResetError,
  UnitGoneError,
  subscribeExercises,
} from '../src/storage/exercises';
import { deleteSetData, exportData, importData } from '../src/storage/db';

beforeEach(freshDb);
const prepare = async () => {
  const topic = learningFixture();
  return topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
};
const choice = (value: string) => ({ ...answered(''), choiceSelections: [value] });

test('preparation and snapshot reads write no exercises, then concurrent ensures retain the first date and notify once', async () => {
  const unit = await prepare();
  const entry = await getUnitSnapshot(unit.id);
  expect(entry).toEqual({ unit: undefined, states: [], resetToken: 0 });
  expect(await listUnits()).toEqual([]);
  expect(await listAttempts()).toEqual([]);
  let calls = 0;
  const stop = subscribeExercises(() => calls++);
  try {
    const [first, second] = await Promise.all([
      ensureTopicUnit(unit, entry.resetToken),
      ensureTopicUnit({ ...unit, createdAt: 456 }, entry.resetToken),
    ]);
    expect(first).toEqual(second);
    expect(first.createdAt).toBe(123);
    expect(calls).toBe(1);
    expect(await listItemStates(unit.id)).toEqual([]);
    await saveItemProgress(unit.id, unit.items[0].id, entry.resetToken, { answer: choice('hiver') });
    expect(await ensureTopicUnit(unit, entry.resetToken)).toEqual(first);
    expect((await getUnitSnapshot(unit.id)).states[0].answer).toEqual(choice('hiver'));
  } finally {
    stop();
  }
});

for (const change of ['reset', 'delete', 'set-delete', 'restore'] as const) {
  test(`a prepared session cannot recreate or write after another tab's ${change}`, async () => {
    const unit = await prepare();
    const entry = await getUnitSnapshot(unit.id);
    await ensureTopicUnit(unit, entry.resetToken);
    if (change === 'reset') await resetUnit(unit.id);
    if (change === 'delete') await deleteUnit(unit.id);
    if (change === 'set-delete') await deleteSetData(unit.setId);
    if (change === 'restore') await importData({ units: [], itemStates: [] });
    expect(await failure(ensureTopicUnit(unit, entry.resetToken))).toBeInstanceOf(StaleResetError);
    expect(await listAttempts()).toEqual([]);
    if (change !== 'reset') expect(await listUnits()).toEqual([]);
    expect((await getUnitSnapshot(unit.id)).states).toEqual([]);
  });
}

test('missing-row entry reads the retained nonzero token; deletion after ensure still rejects the subsequent write', async () => {
  const unit = await prepare();
  await ensureTopicUnit(unit, 0);
  await deleteUnit(unit.id);
  const freshEntry = await getUnitSnapshot(unit.id);
  expect(freshEntry.unit).toBeUndefined();
  expect(freshEntry.resetToken).toBe(1);
  expect(await failure(ensureTopicUnit(unit, 0))).toBeInstanceOf(StaleResetError);
  await ensureTopicUnit(unit, freshEntry.resetToken);
  await deleteUnit(unit.id);
  expect(
    await failure(saveItemProgress(unit.id, unit.items[0].id, freshEntry.resetToken, { answer: choice('été') })),
  ).toBeInstanceOf(UnitGoneError);
  expect(
    await failure(
      checkItem({
        unitId: unit.id,
        itemId: unit.items[0].id,
        resetToken: freshEntry.resetToken,
        answer: choice('été'),
        result: right,
      }),
    ),
  ).toBeInstanceOf(UnitGoneError);
  expect(await listUnits()).toEqual([]);
  expect(await listAttempts()).toEqual([]);
});

test('two-tab checks return the committed answer/result once, with authoritative distractor feedback', async () => {
  const unit = await prepare();
  await ensureTopicUnit(unit, 0);
  const input = { unitId: unit.id, itemId: unit.items[0].id, resetToken: 0, result: right };
  const [first, second] = await Promise.all([
    checkItem({ ...input, answer: choice(' HIVER ') }),
    checkItem({ ...input, answer: choice('été') }),
  ]);
  expect(first.created).toBe(true);
  expect(second.created).toBe(false);
  expect(second.state).toEqual(first.state);
  expect(first.state.checked).toEqual({ correct: false, strictAccents: true });
  const attempts = await listAttempts();
  expect(attempts).toHaveLength(1);
  expect(attempts[0].topicResult?.feedback.summary.en).toBe('TEST winter distractor');
  expect(attempts[0].topicResult?.exerciseRevision).toBe(unit.topicOrigin!.exerciseRevision);
  expect(attempts[0].topicResult?.instruction).toEqual(unit.items[0].topicQuestion!.instruction);
});

test('typed contracts select fallback/accepted feedback with strict accents; redo/reset/delete retain attempts', async () => {
  const unit = await prepare();
  await ensureTopicUnit(unit, 0);
  const item = unit.items[1];
  const input = { unitId: unit.id, itemId: item.id, resetToken: 0, result: right };
  await checkItem({ ...input, answer: answered('ecole') });
  expect((await listAttempts())[0].topicResult?.feedback.summary.en).toBe('TEST typed fallback');
  await clearItemState(unit.id, item.id, 0);
  await checkItem({ ...input, answer: answered(' COLLÈGE ') });
  expect((await listAttempts())[0].topicResult?.feedback.summary.en).toBe('TEST correct');
  await resetUnit(unit.id);
  expect(await listItemStates(unit.id)).toEqual([]);
  await deleteUnit(unit.id);
  expect(await listAttempts()).toHaveLength(2);
  const entry = await getUnitSnapshot(unit.id);
  await ensureTopicUnit(unit, entry.resetToken);
  expect(await listItemStates(unit.id)).toEqual([]);
});

test('topic checks share apostrophe/case/space normalization and feedback survives learner typography in backups', async () => {
  const topic = learningFixture();
  topic.learning.checkpoints[0].questions[1].expectedAnswer = 'l’école';
  topic.learning.checkpoints[0].questions[1].prompt = 'TEST école [___]';
  const unit = topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
  await ensureTopicUnit(unit, 0);
  await checkItem({
    unitId: unit.id,
    itemId: unit.items[1].id,
    resetToken: 0,
    answer: answered(" L'ÉCOLE "),
    result: right,
  });
  expect((await listAttempts())[0].correct).toBe(true);
  const backup = await exportData();
  await freshDb();
  await importData(backup);
  expect((await listAttempts())[0].topicResult?.feedback.summary.en).toBe('TEST correct');
});

test('restore preserves and advances deleted-row tokens; a new revision does not merge progress', async () => {
  const unit = await prepare();
  await ensureTopicUnit(unit, 0);
  await deleteUnit(unit.id);
  const entry = await getUnitSnapshot(unit.id);
  const backup = await exportData();
  await importData(backup);
  expect(await failure(ensureTopicUnit(unit, entry.resetToken))).toBeInstanceOf(StaleResetError);
  const topic = learningFixture();
  topic.learning.instruction.en += ' revised';
  const revised = topicToExerciseUnit(topic, await topicExerciseRevision(topic), 999);
  expect(revised.id).not.toBe(unit.id);
  await ensureTopicUnit(revised, 0);
  expect((await getUnitSnapshot(revised.id)).states).toEqual([]);
});
