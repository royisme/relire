/** Exercises first-frame waiting, preload, independent pack/lexicon failures and next-open retry without a DOM. */
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import * as React from 'react';
import { useWordSheetPack } from '../src/hooks/useWordSheetPack';
import data from '../src/data/noun-gender/pack.json';
import { NounGenderPackSchema } from '../src/types/nounGender';

afterEach(() => {
  mock.restore();
});

test('word-sheet preload waits for nouns, retains independent errors, retries on reopen and ignores closed reads', async () => {
  let state: unknown;
  let effect: React.EffectCallback | undefined;
  const setState = (next: unknown) => {
    state = next;
  };
  spyOn(React, 'useState').mockImplementation((() => [state, setState]) as typeof React.useState);
  spyOn(React, 'useEffect').mockImplementation((next) => {
    effect = next;
  });
  void mock.module('../src/components/word/packSections', () => {
    throw new Error('sections chunk unavailable offline');
  });

  expect(useWordSheetPack(true, 'vais')).toBeUndefined();
  const close = effect!();
  await Bun.sleep(0);
  expect(useWordSheetPack(true, 'vais')).toEqual({ error: 'sections chunk unavailable offline' });
  if (typeof close === 'function') close();
  expect(state).toBeUndefined();
  expect(useWordSheetPack(false, null)).toBeUndefined();

  const load = mock(() => Promise.resolve());
  const pack = NounGenderPackSchema.parse(data);
  let failNouns!: (error: Error) => void;
  const nouns = new Promise<typeof pack>((_resolve, reject) => {
    failNouns = reject;
  });
  void mock.module('../src/components/word/packSections', () => ({
    loadedGrammarPack: () => undefined,
    loadGrammarPack: load,
    loadedNounGenderPack: () => undefined,
    loadNounGenderPack: () => nouns,
    lexiconVerbLines: () => Promise.resolve({ lines: [] }),
  }));
  expect(useWordSheetPack(true, 'vais')).toBeUndefined();
  const cleanup = effect!();
  await Bun.sleep(0);
  expect(load).toHaveBeenCalledTimes(1);
  expect(useWordSheetPack(true, 'vais')).toBeUndefined();
  failNouns(new Error('TEST noun pack chunk unavailable'));
  await Bun.sleep(0);
  expect(useWordSheetPack(true, 'vais')?.sections).toBeDefined();
  expect(useWordSheetPack(true, 'vais')?.nounGender).toEqual({ error: 'TEST noun pack chunk unavailable' });
  expect(useWordSheetPack(true, 'vais')?.lexicon).toEqual({ lines: [] });
  if (typeof cleanup === 'function') cleanup();

  // A noun failure does not poison the next opening or replace the lexicon's own error.
  let finishNouns!: (value: typeof pack) => void;
  const retry = new Promise<typeof pack>((resolve) => {
    finishNouns = resolve;
  });
  const grammarFailure = mock(() => Promise.reject(new Error('TEST grammar pack chunk unavailable')));
  void mock.module('../src/components/word/packSections', () => ({
    loadedGrammarPack: () => undefined,
    loadGrammarPack: grammarFailure,
    loadedNounGenderPack: () => undefined,
    loadNounGenderPack: () => retry,
    lexiconVerbLines: () => Promise.resolve({ lines: [], error: 'TEST lexicon unavailable' }),
  }));
  expect(useWordSheetPack(true, 'plages')).toBeUndefined();
  const closeRetry = effect!();
  await Bun.sleep(0);
  expect(useWordSheetPack(true, 'plages')).toBeUndefined();
  finishNouns(pack);
  await Bun.sleep(0);
  expect(grammarFailure).toHaveBeenCalledTimes(1);
  expect(useWordSheetPack(true, 'plages')?.nounGender).toEqual({ pack });
  expect(useWordSheetPack(true, 'plages')?.lexicon).toEqual({ lines: [], error: 'TEST lexicon unavailable' });
  expect(useWordSheetPack(true, 'autre')).toBeUndefined();
  if (typeof closeRetry === 'function') closeRetry();

  // Closing an unresolved opening drops its eventual reply rather than republishing the entry.
  expect(useWordSheetPack(true, 'plages')).toBeUndefined();
  const closeEarly = effect!();
  if (typeof closeEarly === 'function') closeEarly();
  await Bun.sleep(0);
  expect(state).toBeUndefined();
  expect(useWordSheetPack(false, null)).toBeUndefined();

  // Both packs already loaded: the lexicon ships with the app, so it is still asked and there is no no-service fast path.
  void mock.module('../src/components/word/packSections', () => ({
    loadedGrammarPack: () => ({}),
    loadGrammarPack: load,
    loadedNounGenderPack: () => pack,
    loadNounGenderPack: () => Promise.resolve(pack),
    lexiconVerbLines: () => Promise.resolve({ lines: [], error: 'TEST lexicon unavailable' }),
  }));
  // Refresh the dynamic module's exports without executing another hook effect.
  await import('../src/components/word/packSections');
  expect(useWordSheetPack(true, 'plages')).toBeUndefined();
  const closeLoaded = effect!();
  await Bun.sleep(0);
  expect(useWordSheetPack(true, 'plages')?.nounGender).toEqual({ pack });
  expect(useWordSheetPack(true, 'plages')?.lexicon).toEqual({ lines: [], error: 'TEST lexicon unavailable' });
  if (typeof closeLoaded === 'function') closeLoaded();
});
