/** Owns resolveVerb's pack-first decision: a pack verb makes no AI request and needs no key, any other verb is asked, verified and carries its examples; fake provider, no network. Not the engine or the schema. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import * as accessModule from '../src/services/ai/access';
import { MissingApiKeyError } from '../src/services/ai/errors';
import { resolveVerb } from '../src/services/conjugation/resolve';
import type { AiAccess } from '../src/services/ai/types';
import { GrammarPackSchema } from '../src/types/grammarPack';
import { parlerAnswer } from './fixtures/conjugationAnswer';
import { contextOf, fakeProvider } from './fixtures/fakeProvider';
import { failure, freshDb } from './fixtures/storage';

// Read from disk, not through the module that the loader tests replace.
const pack = GrammarPackSchema.parse(JSON.parse(readFileSync('src/data/grammar-pack/pack.json', 'utf8')));

beforeEach(freshDb);
afterEach(() => mock.restore());

function useAnswers(next: () => unknown) {
  const provider = fakeProvider(next);
  const execution = contextOf(provider, 'unknown').execution;
  spyOn(accessModule, 'getAiAccess').mockReturnValue({ text: () => execution } as unknown as AiAccess);
  return provider;
}

test('a pack verb is answered from the pack with no AI request and no key', async () => {
  const provider = useAnswers(() => parlerAnswer());
  spyOn(accessModule, 'getAiAccess').mockImplementation(() => {
    throw new MissingApiKeyError();
  });
  const { verb, examples } = await resolveVerb(' Aller ', pack);
  expect(verb.status).toBe('pack-reviewed');
  expect(verb.infinitive).toBe('aller');
  expect(examples).toBeUndefined();
  expect(provider.requests).toHaveLength(0);
});

test('a verb outside the pack is asked of the AI, verified, and keeps its examples', async () => {
  const provider = useAnswers(() => parlerAnswer());
  const { verb, examples } = await resolveVerb('Parler', pack);
  expect(provider.requests).toHaveLength(1);
  expect(verb.status).toBe('rule-checked');
  expect(examples?.present.fr).toBe('Phrase present.');
});

test('a pronoun is not added: appeler is not the pack row s’appeler', async () => {
  const provider = useAnswers(() => ({ ...parlerAnswer(), infinitive: 'appeler' }));
  await resolveVerb('appeler', pack);
  expect(provider.requests).toHaveLength(1);
});

test('a missing key is the real error', async () => {
  spyOn(accessModule, 'getAiAccess').mockImplementation(() => {
    throw new MissingApiKeyError();
  });
  expect(await failure(resolveVerb('parler', pack))).toEqual(new MissingApiKeyError());
});
