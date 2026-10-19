/** Owns loader cache/failure tests with an explicit pack fixture, plus the bundled-pack default; not owner reviews. */
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { GOLDEN } from './fixtures/grammarPackGolden';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrammarPackSchema, type GrammarPack } from '../src/types/grammarPack';
import { loadedGrammarPack, loadGrammarPack, resetGrammarPackForTests } from '../src/services/grammarPack/load';
import { useGrammarPack } from '../src/hooks/useGrammarPack';

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
  resetGrammarPackForTests();
});

test('concurrent and subsequent loads share the promise, result and one parse', async () => {
  const first = loadGrammarPack(data);
  expect(loadGrammarPack(data)).toBe(first);
  const pack = await first;
  expect(await loadGrammarPack(data)).toBe(pack);
  expect(loadGrammarPack(data)).toBe(first);
  expect(parseSpy).toHaveBeenCalledTimes(1);
});

test('failure is not cached: a later load parses successfully', async () => {
  data.verbs = [];
  const first = loadGrammarPack(data);
  expect(
    await first.then(
      () => 'unexpected success',
      (error: Error) => error.message,
    ),
  ).toContain('verbs');
  Object.assign(data, fixture());
  const retry = loadGrammarPack(data);
  expect(retry).not.toBe(first);
  expect((await retry).verbs).toHaveLength(4);
  expect(parseSpy).toHaveBeenCalledTimes(2);
});

test('one malformed row rejects the whole pack with joined, readable Zod reasons', async () => {
  delete data.verbs[0].tenses.present['2sg'];
  data.verbs[1].tenses.imperatif!['2sg']!.lead = 'tu';
  const message = await loadGrammarPack(data).then(
    () => 'unexpected success',
    (error: Error) => error.message,
  );
  expect(message).toBe(
    'The grammar pack was not usable: verbs.0.tenses.present.2sg: cell is missing; verbs.1.tenses.imperatif.2sg.lead: lead must be empty in imperatif',
  );
});

test('the loader keeps the resolved pack, and a hook mounted after the load is ready on its first render', async () => {
  // A probe that draws the hook's first-render status; effects do not run in a static render.
  const probe = () => createElement((): string => useGrammarPack().status);
  expect(loadedGrammarPack()).toBeUndefined();
  expect(renderToStaticMarkup(probe())).toBe('loading');
  const pack = await loadGrammarPack(data);
  expect(loadedGrammarPack()).toBe(pack);
  expect(renderToStaticMarkup(probe())).toBe('ready');
  resetGrammarPackForTests();
  expect(loadedGrammarPack()).toBeUndefined();
});

test('a failed load leaves no resolved pack behind', async () => {
  data.verbs = [];
  await loadGrammarPack(data).catch(() => undefined);
  expect(loadedGrammarPack()).toBeUndefined();
});

test('the default load uses the bundled pack, not a test fixture', async () => {
  const pack = await loadGrammarPack();
  expect(pack.verbs.map((verb) => verb.prov.reviewedBy)).not.toContain('TEST ONLY');
});
