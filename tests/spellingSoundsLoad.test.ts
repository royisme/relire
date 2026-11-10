/** Owns fixture-only load sharing, deep immutability and retry tests; not publication or linguistic review. */
import { beforeEach, afterEach, expect, test } from 'bun:test';
import {
  loadSpellingSoundsPack,
  loadedSpellingSoundsPack,
  resetSpellingSoundsPackForTests,
} from '../src/services/spellingSounds/load';
import { spellingPack } from './fixtures/spellingSounds';

beforeEach(resetSpellingSoundsPackForTests);
afterEach(resetSpellingSoundsPackForTests);

test('loads kind ai unchanged, shares one promise and deeply freezes without freezing the input', async () => {
  const input = spellingPack();
  expect(loadedSpellingSoundsPack()).toBeUndefined();
  const pending = loadSpellingSoundsPack(input);
  expect(loadSpellingSoundsPack()).toBe(pending);
  const pack = await pending;
  expect(pack).toEqual(input);
  expect(pack.patterns.every(({ review }) => review.kind === 'ai')).toBe(true);
  expect(await loadSpellingSoundsPack()).toBe(pack);
  expect(loadedSpellingSoundsPack()).toBe(pack);
  for (const object of [
    pack,
    pack.patterns,
    ...pack.patterns.flatMap((row) => [row, row.sound, row.examples, row.review]),
  ]) {
    expect(Object.isFrozen(object)).toBe(true);
  }
  expect(() => {
    pack.patterns[0].sound.push('a');
  }).toThrow();
  expect(() => {
    pack.patterns[0].review.kind = 'human';
  }).toThrow();
  expect(Object.isFrozen(input.patterns[0].review)).toBe(false);
});

test('invalid packs fail whole with the real reason and can be retried', async () => {
  const pack = spellingPack();
  pack.patterns[0].sound = ['unknown'];
  const message = await loadSpellingSoundsPack(pack).then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('patterns.0.sound.0: must be a French IPA chart symbol');
  expect(loadedSpellingSoundsPack()).toBeUndefined();
  expect(await loadSpellingSoundsPack(spellingPack())).toEqual(spellingPack());
});
