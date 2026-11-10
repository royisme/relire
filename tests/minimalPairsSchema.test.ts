/** Owns minimal-pairs structural and exact owner-seed regressions; not linguistic approval or publication. */
import { expect, test } from 'bun:test';
import data from '../data/minimal-pairs/pairs.json';
import reviews from '../data/minimal-pairs/reviews.json';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';
import { PairsSourceSchema, ReviewsSchema } from '../scripts/minimal-pairs/build';
import { MinimalPairsPackSchema, PairSchema } from '../src/types/minimalPairs';
import { pairPack, pairSource } from './fixtures/minimalPairs';

test('a reviewed fixture pack passes without changing the shipped content', () => {
  expect(MinimalPairsPackSchema.parse(pairPack())).toEqual(pairPack());
});

test('duplicate pair ids and identical words are rejected', () => {
  const duplicate = pairPack();
  duplicate.pairs.push({ ...duplicate.pairs[0] });
  expect(MinimalPairsPackSchema.safeParse(duplicate).error!.issues.map((issue) => issue.message)).toContain(
    'duplicate id rue-roue',
  );
  const same = pairPack();
  same.pairs[0].b = same.pairs[0].a;
  expect(MinimalPairsPackSchema.safeParse(same).error!.issues.map((issue) => issue.message)).toContain(
    'a and b are the same word',
  );
});

test('only reviewed status ships, with reviewer and date required', () => {
  const [pair] = pairPack().pairs;
  for (const status of ['draft', 'rejected', 'unreviewed', undefined]) {
    expect(MinimalPairsPackSchema.safeParse({ ...pairPack(), pairs: [{ ...pair, status }] }).success).toBe(false);
  }
  for (const field of ['reviewedBy', 'reviewedAt']) {
    expect(MinimalPairsPackSchema.safeParse({ ...pairPack(), pairs: [{ ...pair, [field]: undefined }] }).success).toBe(
      false,
    );
  }
});

test('contrast ids use exactly two distinct chart symbols, including the chart nasal forms', () => {
  for (const contrast of ['unknown-u', 'y-y', 'y', 'y-u-e', 'r-l', 'ã-ɔ̃']) {
    expect(PairSchema.safeParse({ ...pairSource().pairs[0], contrast }).success).toBe(false);
  }
  for (const contrast of ['y-u', 'ɑ̃-ɔ̃', 'e-ɛ', 'ɔ̃-o', 'ɛ̃-ɛ', 'b-p', 'ʁ-l']) {
    expect(PairSchema.safeParse({ ...pairSource().pairs[0], contrast }).success).toBe(true);
  }
});

test('NFD words, straight apostrophes, prose notes, authored status and per-word IPA are rejected', () => {
  const pair = pairSource().pairs[1];
  for (const change of [
    { a: 'fe\u0301e' },
    { b: "l'air" },
    { note: 'Many speakers merge these vowels.' },
    { status: 'reviewed' },
    { ipaA: 'fe' },
  ]) {
    expect(PairSchema.safeParse({ ...pair, ...change }).success).toBe(false);
  }
  expect(PairSchema.safeParse({ ...pair, a: 'l’air' }).success).toBe(true);
  expect(
    MinimalPairsPackSchema.safeParse({ ...pairPack(), pairs: [{ ...pairPack().pairs[0], ipaA: 'ry' }] }).success,
  ).toBe(false);
});

test('the authored source is exactly the 32 owner-confirmed pairs and their chart contrasts', () => {
  const source = PairsSourceSchema.parse(data);
  const groups = [
    ['y-u', 'rue/roue vu/vous tu/tout dessus/dessous'],
    ['ɑ̃-ɔ̃', 'vent/vont temps/thon sans/son banc/bon dent/dont lent/long'],
    ['e-ɛ', 'fée/fait'],
    ['ɔ̃-o', 'bon/beau son/seau pont/pot fond/faux on/eau'],
    ['ɛ̃-ɛ', 'faim/fait vin/vais pain/paix main/mais saint/sais'],
    ['b-p', 'bain/pain boire/poire bas/pas beau/peau bord/port bulle/pull'],
    ['ʁ-l', 'rire/lire roi/loi riz/lit reine/laine rat/là'],
  ];
  expect(source.pairs).toHaveLength(32);
  expect(source.pairs.map(({ contrast, a, b }) => `${contrast}:${a}/${b}`)).toEqual(
    groups.flatMap(([contrast, words]) => words.split(' ').map((words) => `${contrast}:${words}`)),
  );
  expect(new Set(source.pairs.map(({ id }) => id)).size).toBe(32);
  expect(source.pairs.filter(({ note }) => note).map(({ id, note }) => ({ id, note }))).toEqual([
    { id: 'fee-fait', note: 'minimalPairs.notes.tendency' },
  ]);
  for (const locale of [en, zh]) expect(locale.minimalPairs.notes.tendency).toBeTruthy();
  // The owner's review is recorded for exactly these pairs (the build refuses a pair whose row changed since).
  expect(ReviewsSchema.parse(reviews).records.map(({ pairId }) => pairId)).toEqual(source.pairs.map(({ id }) => id));
});
