/** Which lexicon cells write a tapped form: hand-typed TEST verbs, no Morphalou rows. */
import { expect, test } from 'bun:test';
import { matchVerbForm } from '../src/services/lexicon/match';
import type { VerbData } from '../src/types/lexicon';
import { chanterData } from './fixtures/lexicon';

/** An irregular-looking TEST verb: variants in a cell, one imperative-only form, participles apart. */
const odd = (): VerbData => ({
  tenses: {
    present: { '1sg': ['vais', 'vas'], '2sg': ['vas'], '3sg': ['va'] },
    imperatif: { '2sg': ['va'], '1pl': ['allons'] },
  },
  participles: { present: ['allant'], past: { ms: ['allé'], fs: ['allée'], mp: ['allés'], fp: ['allées'] } },
});

test('a regular form is every cell that writes it, tenses in page order and persons in order', () => {
  expect(matchVerbForm(chanterData(), 'chante')).toEqual({
    tenses: [
      { tense: 'present', persons: ['1sg', '3sg'] },
      { tense: 'subjonctif', persons: ['1sg', '3sg'] },
      { tense: 'imperatif', persons: ['2sg'] },
    ],
    participles: [],
  });
  expect(matchVerbForm(chanterData(), 'chantons')).toEqual({
    tenses: [
      { tense: 'present', persons: ['1pl'] },
      { tense: 'imperatif', persons: ['1pl'] },
    ],
    participles: [],
  });
});

test('a form that is in the impératif only names the impératif', () => {
  expect(matchVerbForm(odd(), 'allons')).toEqual({
    tenses: [{ tense: 'imperatif', persons: ['1pl'] }],
    participles: [],
  });
});

test('a variant matches its own cell, and a homograph across cells lists all of them', () => {
  expect(matchVerbForm(odd(), 'vas').tenses).toEqual([{ tense: 'present', persons: ['1sg', '2sg'] }]);
  expect(matchVerbForm(odd(), 'va').tenses).toEqual([
    { tense: 'present', persons: ['3sg'] },
    { tense: 'imperatif', persons: ['2sg'] },
  ]);
});

test('participles are named by agreement, and the present participle apart', () => {
  expect(matchVerbForm(chanterData(), 'chantées')).toEqual({ tenses: [], participles: ['fp'] });
  expect(matchVerbForm(chanterData(), 'chanté').participles).toEqual(['ms']);
  expect(matchVerbForm(chanterData(), 'chantant').participles).toEqual(['present']);
});

test('a form that is not in the entry matches nothing, and no compound tense is ever named', () => {
  expect(matchVerbForm(chanterData(), 'mange')).toEqual({ tenses: [], participles: [] });
  expect(matchVerbForm(chanterData(), 'chanter')).toEqual({ tenses: [], participles: [] });
  const tenses = matchVerbForm(chanterData(), 'chante').tenses.map(({ tense }) => tense);
  expect(tenses).not.toContain('passeCompose');
});

test('the tapped token is folded like the pack lookup: case is ignored, accents are kept', () => {
  expect(matchVerbForm(chanterData(), 'Chantons').tenses).toHaveLength(2);
  expect(matchVerbForm(odd(), 'alle').participles).toEqual([]);
  expect(matchVerbForm(odd(), 'ALLÉ').participles).toEqual(['ms']);
});
