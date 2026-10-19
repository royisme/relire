/**
 * Owns the reverse index and its per-lemma grouping against a small pack built in the test (the real pack
 * has no suivre, manger, lever or se lever): keys, normalisation, homographs, merging, the four-lemma limit and
 * the memoised index. The pack is passed in, never mocked. Not the pack loader or the sheet.
 */
import { expect, test } from 'bun:test';
import { findPackVerb } from '../src/services/grammarPack/lookup';
import { lookupVerbForms, reverseLookup } from '../src/services/grammarPack/reverse';
import type { GrammarPack, Verb } from '../src/types/grammarPack';
import { generateVerb, type VerbSpec } from '../src/services/conjugation/generate';
import { CONTROL_SPECS, IRREGULARS } from './fixtures/grammarPackVerbs';

const SPECS: VerbSpec[] = [
  ...CONTROL_SPECS.filter((spec) => spec.id !== 's-appeler'),
  { id: 'manger', infinitive: 'manger', base: 'mang', rule: 'er-ger', aux: 'avoir' },
  { id: 'se-lever', infinitive: 'se lever', base: 'lev', rule: 'er-e-grave', aux: 'etre' },
  { id: 'lever', infinitive: 'lever', base: 'lev', rule: 'er-e-grave', aux: 'avoir' },
  { id: 'suivre', infinitive: 'suivre', rule: 'irregular', aux: 'avoir' },
];
const irregulars = {
  ...IRREGULARS,
  // `suis` is also the present of suivre: the homograph of être.
  suivre: {
    participles: { present: 'suivant', past: 'suivi' },
    forms: {
      present: { '1sg': 'suis', '2sg': 'suis', '3sg': 'suit', '1pl': 'suivons', '2pl': 'suivez', '3pl': 'suivent' },
      imparfaitStem: 'suiv',
      futurStem: 'suivr',
      subjonctif: {
        '1sg': 'suive',
        '2sg': 'suives',
        '3sg': 'suive',
        '1pl': 'suivions',
        '2pl': 'suiviez',
        '3pl': 'suivent',
      },
    },
  },
};

const pack = (verbs: Verb[]): GrammarPack => ({ schemaVersion: 1, packVersion: '0.0.0', verbs });
const verbs = SPECS.map((spec) => generateVerb(spec, irregulars).verb);
const testPack = pack(verbs);
const ids = (token: string, from = testPack) => reverseLookup(from, token).map((hit) => hit.verbId);

test('a homograph gives each lemma its own line: suis is être and suivre', () => {
  const groups = lookupVerbForms(testPack, 'suis');
  expect(groups.map((group) => group.verb.id)).toEqual(['etre', 'suivre']);
  expect(groups[0].tenses).toEqual([{ tense: 'present', persons: ['1sg'] }]);
  expect(groups[1].tenses).toEqual([
    { tense: 'present', persons: ['1sg', '2sg'] },
    { tense: 'imperatif', persons: ['2sg'] }, // derived from the present, as for any verb
  ]);
});

test('a form that several cells share gives several cells, merged per lemma in page order', () => {
  const [manger, ...rest] = lookupVerbForms(testPack, 'mange');
  expect(rest).toEqual([]);
  expect(manger.verb.id).toBe('manger');
  expect(manger.tenses).toEqual([
    { tense: 'present', persons: ['1sg', '3sg'] },
    { tense: 'subjonctif', persons: ['1sg', '3sg'] },
    { tense: 'imperatif', persons: ['2sg'] },
  ]);
  expect(manger.participles).toEqual([]);
});

test('the pronominal imperative is indexed as the whole hyphenated token', () => {
  expect(reverseLookup(testPack, 'lève-toi')).toEqual([{ verbId: 'se-lever', tense: 'imperatif', person: '2sg' }]);
  // The bare form belongs to lever and to se lever (present, je): two lemmas.
  expect(ids('lève').filter((id, i, all) => all.indexOf(id) === i)).toEqual(['se-lever', 'lever']);
});

test('dash, case and decomposed letters reach the same hits', () => {
  const expected = reverseLookup(testPack, 'lève-toi');
  for (const query of ['lève‐toi', 'lève–toi', 'LÈVE-TOI', 'lève-toi', '  lève-toi '])
    expect(reverseLookup(testPack, query)).toEqual(expected);
});

test('a and à stay distinct: a is avoir, à is nothing', () => {
  expect(reverseLookup(testPack, 'a')).toEqual([{ verbId: 'avoir', tense: 'present', person: '3sg' }]);
  expect(reverseLookup(testPack, 'à')).toEqual([]);
});

test('input after the reader stripped an elision prefix: ai is avoir, 1sg', () => {
  // `j’ai` reaches the sheet as `ai`.
  const hits = reverseLookup(testPack, 'ai').filter((hit) => hit.verbId === 'avoir');
  expect(hits).toContainEqual({ verbId: 'avoir', tense: 'present', person: '1sg' });
});

test('participles are indexed, the compound passé composé is not', () => {
  expect(reverseLookup(testPack, 'allée')).toEqual([{ verbId: 'aller', participle: 'fs' }]);
  expect(reverseLookup(testPack, 'allant')).toEqual([{ verbId: 'aller', participle: 'present' }]);
  expect(lookupVerbForms(testPack, 'allés')[0].participles).toEqual(['mp']);
  expect(reverseLookup(testPack, 'suis allé')).toEqual([]);
  expect(reverseLookup(testPack, 'je suis allé')).toEqual([]);
});

test('no hit gives nothing', () => {
  expect(reverseLookup(testPack, 'maison')).toEqual([]);
  expect(lookupVerbForms(testPack, 'maison')).toEqual([]);
  expect(lookupVerbForms(testPack, '')).toEqual([]);
});

test('an infinitive is not a form of itself', () => {
  expect(reverseLookup(testPack, 'manger')).toEqual([]);
});

test('lever never resolves to se lever', () => {
  const onlyPronominal = pack(verbs.filter((verb) => verb.id !== 'lever'));
  expect(findPackVerb(onlyPronominal, 'lever')).toBeUndefined();
  expect(findPackVerb(testPack, 'lever')?.id).toBe('lever');
});

test('at most four lemmas, in pack order', () => {
  const aller = verbs.find((verb) => verb.id === 'aller')!;
  const many = pack(['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...aller, id: `aller-${id}` })));
  expect(lookupVerbForms(many, 'vais').map((group) => group.verb.id)).toEqual([
    'aller-a',
    'aller-b',
    'aller-c',
    'aller-d',
  ]);
});

test('the index is built once per pack: a second query reuses it, another pack gets its own', () => {
  expect(reverseLookup(testPack, 'vais')).toBe(reverseLookup(testPack, 'vais'));
  const copy = pack([...verbs]);
  expect(reverseLookup(copy, 'vais')).not.toBe(reverseLookup(testPack, 'vais'));
});
