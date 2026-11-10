/** Owns saved-answer counts and clearing across cache kinds; not AI requests or cache keys. */
import { beforeEach, expect, test } from 'bun:test';
import { freshDb } from './fixtures/storage';
import { cacheCounts, clearCache, putCached } from '../src/storage/cache';

beforeEach(freshDb);

test('an empty cache reports zero for every saved-answer category', async () => {
  expect(await cacheCounts()).toEqual({
    words: 0,
    conjugations: 0,
    content: 0,
    sentences: 0,
    exercises: 0,
    prosody: 0,
  });
});

test('counts conjugations separately and keeps exercise answers grouped', async () => {
  await putCached('conjugation', 'verb-1', null);
  await putCached('conjugation', 'verb-2', null);
  expect(await cacheCounts()).toEqual({
    words: 0,
    conjugations: 2,
    content: 0,
    sentences: 0,
    exercises: 0,
    prosody: 0,
  });

  for (const kind of ['word', 'sentence', 'prosody', 'exercises', 'hint', 'explanation'] as const) {
    await putCached(kind, 'entry', null);
  }
  await putCached('content', 'http://content.test/v1/topics', []);
  expect(await cacheCounts()).toEqual({
    words: 1,
    conjugations: 2,
    content: 1,
    sentences: 1,
    exercises: 3,
    prosody: 1,
  });

  await clearCache();
  expect(await cacheCounts()).toEqual({
    words: 0,
    conjugations: 0,
    content: 0,
    sentences: 0,
    exercises: 0,
    prosody: 0,
  });
});
