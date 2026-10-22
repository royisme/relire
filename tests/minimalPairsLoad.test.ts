/** Owns fixture-only loader validation, sharing, immutability and failure retry; no generated pack is required. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import {
  loadedMinimalPairsPack,
  loadMinimalPairsPack,
  resetMinimalPairsPackForTests,
} from '../src/services/minimalPairs/load';
import { MinimalPairsPackSchema } from '../src/types/minimalPairs';
import { pairPack } from './fixtures/minimalPairs';

beforeEach(resetMinimalPairsPackForTests);
afterEach(resetMinimalPairsPackForTests);

test('the loader returns exactly the shipped fixture, shares one parse and deeply freezes it', async () => {
  const data = pairPack();
  const parse = spyOn(MinimalPairsPackSchema, 'safeParse');
  try {
    expect(loadedMinimalPairsPack()).toBeUndefined();
    const first = loadMinimalPairsPack(data);
    expect(loadMinimalPairsPack()).toBe(first);
    const pack = await first;
    expect(pack).toEqual(data);
    expect(pack.pairs.every(({ status }) => status === 'reviewed')).toBe(true);
    expect(loadedMinimalPairsPack()).toBe(pack);
    expect(await loadMinimalPairsPack()).toBe(pack);
    expect(parse).toHaveBeenCalledTimes(1);
    for (const object of [pack, pack.pairs, ...pack.pairs]) expect(Object.isFrozen(object)).toBe(true);
    expect(() => {
      pack.pairs[0].a = 'changed';
    }).toThrow();
    expect(data.pairs[0].a).toBe('rue');
  } finally {
    parse.mockRestore();
  }
});

test('invalid shipped rows reject the whole pack with real reasons and permit a later retry', async () => {
  const data = pairPack();
  const first = loadMinimalPairsPack({ ...data, pairs: [{ ...data.pairs[0], status: 'draft' }] });
  const message = await first.then(
    () => '',
    (error: Error) => error.message,
  );
  expect(message).toContain('The minimal-pairs pack was not usable: pairs.0.status:');
  expect(loadedMinimalPairsPack()).toBeUndefined();
  const retry = loadMinimalPairsPack(data);
  expect(retry).not.toBe(first);
  expect(await retry).toEqual(data);
});
