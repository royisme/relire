/** Owns isolated loader cache/failure tests using a mocked JSON module; not the real pack or owner reviews. */
import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { GrammarPackSchema, type GrammarPack } from '../src/types/grammarPack';

const fixture = (): GrammarPack => ({
  schemaVersion: 1,
  packVersion: '0.1.0',
  verbs: Object.values(structuredClone(GOLDEN)).map((verb) => ({
    ...verb,
    prov: {
      origin: 'rule',
      checkedAgainst: ['consistency', 'human'],
      status: 'reviewed',
      checkedAt: '2026-10-18',
      reviewedBy: 'TEST ONLY',
    },
  })),
});
const data = fixture();
void mock.module('../src/data/grammar-pack/pack.json', () => ({ default: data }));
const { loadGrammarPack, resetGrammarPackForTests } = await import('../src/services/grammarPack/load');
let parseSpy: ReturnType<typeof spyOn<typeof GrammarPackSchema, 'safeParse'>>;
beforeEach(() => {
  resetGrammarPackForTests();
  Object.assign(data, fixture());
  // Zod materialises methods lazily; Bun cannot spy on the initial accessor.
  void GrammarPackSchema.safeParse;
  parseSpy = spyOn(GrammarPackSchema, 'safeParse');
});
afterEach(() => {
  parseSpy.mockRestore();
});

test('concurrent and subsequent loads share the promise, result and one import/parse', async () => {
  const first = loadGrammarPack();
  expect(loadGrammarPack()).toBe(first);
  const pack = await first;
  expect(await loadGrammarPack()).toBe(pack);
  expect(loadGrammarPack()).toBe(first);
  expect(parseSpy).toHaveBeenCalledTimes(1);
});

test('failure is not cached: a later load reimports and parses successfully', async () => {
  data.verbs = [];
  const first = loadGrammarPack();
  expect(
    await first.then(
      () => 'unexpected success',
      (error: Error) => error.message,
    ),
  ).toContain('verbs');
  Object.assign(data, fixture());
  const retry = loadGrammarPack();
  expect(retry).not.toBe(first);
  expect((await retry).verbs).toHaveLength(4);
  expect(parseSpy).toHaveBeenCalledTimes(2);
});

test('one malformed row rejects the whole pack with joined, readable Zod reasons', async () => {
  delete data.verbs[0].tenses.present['2sg'];
  data.verbs[1].tenses.imperatif!['2sg']!.lead = 'tu';
  const message = await loadGrammarPack().then(
    () => 'unexpected success',
    (error: Error) => error.message,
  );
  expect(message).toBe(
    'The grammar pack was not usable: verbs.0.tenses.present.2sg: cell is missing; verbs.1.tenses.imperatif.2sg.lead: lead must be empty in imperatif',
  );
});
