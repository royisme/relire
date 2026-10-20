/** TEST-only paired topic backup capabilities, retained history and atomic rejection. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb, answered, right, failure, article } from './fixtures/storage';
import { learningFixture } from './fixtures/grammarLearning';
import { topicExerciseRevision, topicToExerciseUnit } from '../src/services/grammarTopics/checkpoints';
import { checkItem, deleteUnit, ensureTopicUnit, ExerciseBackupError, getUnitSnapshot } from '../src/storage/exercises';
import { exportData, importData } from '../src/storage/db';

beforeEach(freshDb);
async function backup() {
  const topic = learningFixture();
  const unit = topicToExerciseUnit(topic, await topicExerciseRevision(topic), 123);
  await ensureTopicUnit(unit, 0);
  await checkItem({
    unitId: unit.id,
    itemId: unit.items[0].id,
    resetToken: 0,
    answer: { ...answered(''), choiceSelections: ['hiver'] },
    result: right,
  });
  return structuredClone(await exportData());
}

test('roundtrip retains both languages and original keys/feedback without any service or key', async () => {
  const original = await backup();
  await freshDb();
  await importData(original);
  const restored = await exportData();
  expect(restored).toEqual(original);
  expect(restored.attempts[0].topicResult!.feedback.summary.zh).toBeTruthy();
  expect(JSON.stringify(restored)).not.toMatch(/apiKey|cache/i);
  await deleteUnit(original.units[0].id);
  const deleted = await exportData();
  await freshDb();
  await importData(deleted);
  expect((await exportData()).attempts).toEqual(original.attempts);
  expect((await getUnitSnapshot(original.units[0].id)).unit).toBeUndefined();
});

test('malformed or unpaired metadata rejects the entire restore without stripping it', async () => {
  const original = await backup();
  const mutations: ((value: typeof original) => void)[] = [
    (b) => {
      delete b.units[0].topicOrigin;
    },
    (b) => {
      delete b.units[0].items[0].topicQuestion;
    },
    (b) => {
      b.units[0].topicOrigin!.exerciseRevision = 'short';
    },
    (b) => {
      b.units[0].topicOrigin!.instruction.zh = 'TEST';
    },
    (b) => {
      b.units[0].items[0].type = 'OPEN_QA';
    },
    (b) => {
      delete b.attempts[0].topicResult;
    },
    (b) => {
      b.attempts[0].topicResult!.exerciseRevision = 'a'.repeat(64);
    },
    (b) => {
      b.attempts[0].topicResult!.instruction.en = '';
    },
    (b) => {
      b.attempts[0].topicResult!.feedback.summary.zh = '';
    },
    (b) => {
      b.attempts[0].topicResult!.feedback.summary.en = 'not the reviewed match';
    },
    (b) => {
      b.attempts[0].unitId = 'ordinary';
    },
    (b) => {
      b.attempts[0].itemId = 'missing';
    },
    (b) => {
      b.units[0].items[0].expectedAnswer = 'hiver';
    },
  ];
  for (const mutate of mutations) {
    const probe = structuredClone(original);
    probe.articles = [article('replacement')];
    mutate(probe);
    expect(await failure(importData(probe))).toBeInstanceOf(ExerciseBackupError);
    expect(await exportData()).toEqual(original);
  }
});

test('partial attempt restore validates against surviving units inside the restore transaction', async () => {
  const original = await backup();
  const attempt = structuredClone(original.attempts[0]);
  attempt.topicResult!.feedback.summary.en = 'wrong snapshot';
  expect(await failure(importData({ articles: [article('replacement')], attempts: [attempt] }))).toBeInstanceOf(
    ExerciseBackupError,
  );
  expect(await exportData()).toEqual(original);
  await importData({ attempts: [] });
  expect((await exportData()).units).toEqual(original.units);
  expect((await exportData()).attempts).toEqual([]);
});
