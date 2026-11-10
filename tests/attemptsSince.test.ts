/** listAttemptsSince: one timestamp-index scan splitting today's attempts from wrong-before history; fake IndexedDB only. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb } from './fixtures/storage';
import { db } from '../src/storage/db';
import { listAttemptsSince } from '../src/storage/exerciseAttempts';
import type { ExerciseAttempt } from '../src/types/exercises';

beforeEach(freshDb);

const start = 1_000;
const attempt = (unitId: string, itemId: string, timestamp: number, correct = false): ExerciseAttempt => ({
  id: `${unitId}:${itemId}:${timestamp}`,
  learningArea: 'grammar',
  unitId,
  itemId,
  grammarTag: 'present',
  prompt: 'TEST prompt',
  userAnswer: 'TEST answer',
  expectedAnswer: 'TEST expected',
  correct,
  timestamp,
});

async function seed(...rows: ExerciseAttempt[]) {
  const d = await db();
  for (const row of rows) await d.put('attempts', row);
}

test('today holds attempts from start on, boundary included, ascending by timestamp', async () => {
  await seed(
    attempt('u1', 'early', 400),
    attempt('u1', 'just-before', start - 1),
    attempt('u2', 'boundary', start),
    attempt('u2', 'later', 1200),
    attempt('u1', 'latest', 1500),
  );
  const { today } = await listAttemptsSince(start);
  expect(today.map(({ unitId, itemId }) => `${unitId}:${itemId}`)).toEqual(['u2:boundary', 'u2:later', 'u1:latest']);
});

test('wrongBefore holds items with an incorrect attempt before start, even when a later attempt was correct', async () => {
  await seed(
    attempt('u1', 'wrong-then-right', 400),
    attempt('u1', 'wrong-then-right', 500, true),
    attempt('u2', 'correct-only', 600, true),
    attempt('u3', 'first-wrong-today', 1200),
    attempt('u4', 'retried-today', 800),
    attempt('u4', 'retried-today', 1300, true),
  );
  const { wrongBefore } = await listAttemptsSince(start);
  expect(wrongBefore).toEqual(new Set(['u1:wrong-then-right', 'u4:retried-today']));
});

test('an empty attempts store yields empty results', async () => {
  expect(await listAttemptsSince(start)).toEqual({ today: [], wrongBefore: new Set() });
});
