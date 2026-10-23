/** Owns api.fetchConjugation: one request and one key per engine infinitive, and an answer for another verb is an error and is not cached; fake provider, no network, not the schema or the engine. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as accessModule from '../src/services/ai/access';
import type { AiAccess } from '../src/services/ai/types';
import * as api from '../src/services/api';
import { erAnswer, parlerAnswer } from './fixtures/conjugationAnswer';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { failure, freshDb } from './fixtures/storage';

beforeEach(freshDb);
afterEach(() => mock.restore());

function useAnswers(next: () => unknown) {
  const provider = fakeProvider(next);
  const execution = contextOf(provider, 'unknown').execution;
  spyOn(accessModule, 'getAiAccess').mockReturnValue({ text: () => execution } as unknown as AiAccess);
  return provider;
}

test('Parler and parler are one request and one cache entry', async () => {
  const provider = useAnswers(() => parlerAnswer());
  const first = await api.fetchConjugation('Parler');
  expect(await api.fetchConjugation(' parler ')).toEqual(first);
  expect(provider.requests).toHaveLength(1);
  expect(provider.requests[0].prompt).toContain('the French verb "parler"');
});

test("s'habiller and s’habiller are one request, sent with the typographic apostrophe", async () => {
  const habiller = erAnswer('s’habiller', 'er-regular', { plain: 'habill', strong: 'habill', fut: 'habiller' });
  const provider = useAnswers(() => habiller);
  await api.fetchConjugation("s'habiller");
  await api.fetchConjugation('s’habiller');
  expect(provider.requests).toHaveLength(1);
  expect(provider.requests[0].prompt).toContain('"s’habiller"');
});

test('an answer for another verb throws an error naming both and is not cached', async () => {
  let answer: unknown = erAnswer('aimer', 'er-regular', { plain: 'aim', strong: 'aim', fut: 'aimer' });
  const provider = useAnswers(() => answer);
  const err = await failure(api.fetchConjugation('parler'));
  expect(err).toEqual(new Error('The model answered for aimer, not parler.'));
  answer = parlerAnswer();
  expect((await api.fetchConjugation('parler')).infinitive).toBe('parler');
  expect(provider.requests).toHaveLength(2);
});
