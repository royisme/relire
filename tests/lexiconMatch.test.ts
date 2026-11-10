/** Which lexicon cells write a tapped form: hand-typed TEST verbs, no Morphalou rows. */
import { expect, test } from 'bun:test';
import { matchVerbForm } from '../src/services/lexicon/match';
import type { VerbData } from '../src/types/lexicon';
import { amuserData, chanterData, laverData } from './fixtures/lexicon';
import { lexiconTable } from '../src/services/lexicon/table';
import { cellText } from '../src/components/study/grammar/forms';

/** An irregular-looking TEST verb: variants in a cell, one imperative-only form, participles apart. */
const odd = (): VerbData => ({
  tenses: {
    present: { '1sg': ['vais', 'vas'], '2sg': ['vas'], '3sg': ['va'] },
    imperatif: { '2sg': ['va'], '1pl': ['allons'] },
  },
  participles: { present: ['allant'], past: { ms: ['allé'], fs: ['allée'], mp: ['allés'], fp: ['allées'] } },
});

test('pronominal dictionary tables compose six leads and postposed imperative clitics', () => {
  const table = lexiconTable('se laver', laverData())!;
  expect({
    present: Object.values(table.tenses.present!).map(cellText),
    imperative: Object.values(table.tenses.imperatif!).map(cellText),
  }).toEqual({
    present: [
      'je me lave',
      'tu te laves',
      'il/elle se lave',
      'nous nous lavons',
      'vous vous lavez',
      'ils/elles se lavent',
    ],
    imperative: ['lave-toi', 'lavons-nous', 'lavez-vous'],
  });
});

for (const lemma of ["s'amuser", 's’amuser']) {
  test(`${lemma}: dictionary reflexives elide after folding apostrophes`, () => {
    const table = lexiconTable(lemma, amuserData())!;
    expect(Object.values(table.tenses.present!).map(cellText)).toEqual([
      'je m’amuse',
      'tu t’amuses',
      'il/elle s’amuse',
      'nous nous amusons',
      'vous vous amusez',
      'ils/elles s’amusent',
    ]);
  });
}

for (const lemma of ['se hisser', "s'habiller", 's’habiller']) {
  test(`${lemma}: no dictionary table without an aspirated-h flag`, () => {
    expect(lexiconTable(lemma, laverData())).toBeUndefined();
  });
}

test('a non-pronominal dictionary table keeps its bare forms and separate subject column', () => {
  const data = chanterData();
  const table = lexiconTable('chanter', data)!;
  expect({
    pronominal: table.pronominal,
    tenses: Object.fromEntries(
      Object.entries(table.tenses).map(([tense, cells]) => [
        tense,
        Object.fromEntries(
          Object.entries(cells).map(([person, cell]) => [person, { text: cellText(cell), lead: cell.lead }]),
        ),
      ]),
    ),
  }).toEqual({
    pronominal: false,
    tenses: Object.fromEntries(
      Object.entries(data.tenses).map(([tense, cells]) => [
        tense,
        Object.fromEntries(
          Object.entries(cells).map(([person, forms]) => [person, { text: forms.join(' / '), lead: '' }]),
        ),
      ]),
    ),
  });
});

test('composed dictionary variants remain variants and taps still match the bare input', () => {
  const data = laverData();
  data.tenses.present!['1sg'] = ['lave', 'lavex']; // TEST-only alternate spelling.
  data.tenses.imperatif!['2sg'] = ['lave', 'lavex'];
  data.tenses.subjonctif = { '3sg': ['lave'] };
  const table = lexiconTable('se laver', data)!;
  const tapped = matchVerbForm(data, 'lavex');
  expect({
    cell: table.tenses.present!['1sg'],
    imperative: table.tenses.imperatif!['2sg'],
    subjunctive: cellText(table.tenses.subjonctif!['3sg']!),
    marked: tapped.tenses.map(({ tense, persons }) => [
      tense,
      persons.map((person) => cellText(table.tenses[tense as keyof typeof table.tenses]![person]!)),
    ]),
    bare: data.tenses.imperatif!['2sg'],
  }).toEqual({
    cell: { lead: 'je me', forms: ['lave', 'lavex'] },
    imperative: { lead: '', forms: ['lave-toi', 'lavex-toi'] },
    subjunctive: 'qu’il/elle se lave',
    marked: [
      ['present', ['je me lave / lavex']],
      ['imperatif', ['lave-toi / lavex-toi']],
    ],
    bare: ['lave', 'lavex'],
  });
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
