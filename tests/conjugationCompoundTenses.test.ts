/**
 * The four compound tenses stored like passé composé: plus-que-parfait, futur antérieur, conditionnel passé and
 * subjonctif passé are the auxiliary in its own tense plus the past participle, with passé composé's agreement
 * rules and lead. Also pins the seven tenses that existed before them, so a regression in the shared helper
 * cannot pass unnoticed. Owns those cells only; not the rule tables (conjugationRules) or the checks
 * (grammarPackChecks).
 */
import { expect, test } from 'bun:test';
import { cellAt } from '../scripts/grammar-pack/checks';
import type { GeneratedVerb, VerbSpec } from '../src/services/conjugation/generate';
import { COMPOUND_AUX } from '../src/services/conjugation/rules';
import { COMPOUND_TENSES, type Cell, type Person, type Tense, type Verb } from '../src/types/grammarPack';
import { generate } from './fixtures/grammarPackVerbs';

const PERSONS: Person[] = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];

/** What a learner reads: lead and primary form, no space after an elided lead. */
const say = ({ lead, forms }: Pick<Cell, 'lead' | 'forms'>) =>
  lead === '' || lead.endsWith('’') ? lead + forms[0] : `${lead} ${forms[0]}`;
const sayTense = (verb: Verb, tense: Tense) => PERSONS.map((person) => say(cellAt(verb, tense, person)!));

const AVOIR = { id: 'parler', infinitive: 'parler', base: 'parl', rule: 'er-regular', aux: 'avoir' } as const;
const ETRE = { id: 'aller', infinitive: 'aller', rule: 'irregular', aux: 'etre' } as const;
const PRONOMINAL = {
  id: 's-appeler',
  infinitive: 's’appeler',
  base: 'appel',
  rule: 'er-eler-double',
  aux: 'etre',
} as const;
const H_MUET = { id: 'habiter', infinitive: 'habiter', base: 'habit', rule: 'er-regular', aux: 'avoir' } as const;
const H_ASPIRE = {
  id: 'harceler',
  infinitive: 'harceler',
  base: 'harcel',
  rule: 'er-eler-double',
  aux: 'avoir',
  hAspire: true,
} as const;

const verbOf = (spec: VerbSpec) => generate(spec).verb;

/** One verb's compound cells as `lead + forms`, typed by hand from French grammar. */
type Expected = Record<(typeof COMPOUND_TENSES)[number], [string, string[]][]>;

function expectCompound(verb: Verb, expected: Expected) {
  for (const tense of COMPOUND_TENSES)
    expect(PERSONS.map((person) => verb.tenses[tense][person])).toEqual(
      expected[tense].map(([lead, forms]) => ({ lead, forms })),
    );
}

test('a regular avoir verb: the auxiliary in its own tense, never an agreement variant', () => {
  expectCompound(verbOf(AVOIR), {
    passeCompose: [
      ['j’', ['ai parlé']],
      ['tu', ['as parlé']],
      ['il/elle', ['a parlé']],
      ['nous', ['avons parlé']],
      ['vous', ['avez parlé']],
      ['ils/elles', ['ont parlé']],
    ],
    plusQueParfait: [
      ['j’', ['avais parlé']],
      ['tu', ['avais parlé']],
      ['il/elle', ['avait parlé']],
      ['nous', ['avions parlé']],
      ['vous', ['aviez parlé']],
      ['ils/elles', ['avaient parlé']],
    ],
    futurAnterieur: [
      ['j’', ['aurai parlé']],
      ['tu', ['auras parlé']],
      ['il/elle', ['aura parlé']],
      ['nous', ['aurons parlé']],
      ['vous', ['aurez parlé']],
      ['ils/elles', ['auront parlé']],
    ],
    conditionnelPasse: [
      ['j’', ['aurais parlé']],
      ['tu', ['aurais parlé']],
      ['il/elle', ['aurait parlé']],
      ['nous', ['aurions parlé']],
      ['vous', ['auriez parlé']],
      ['ils/elles', ['auraient parlé']],
    ],
    subjonctifPasse: [
      ['que j’', ['aie parlé']],
      ['que tu', ['aies parlé']],
      ['qu’il/elle', ['ait parlé']],
      ['que nous', ['ayons parlé']],
      ['que vous', ['ayez parlé']],
      ['qu’ils/elles', ['aient parlé']],
    ],
  });
});

test('an être verb: the participle agrees, and vous keeps its polite singular variants', () => {
  const aller = verbOf(ETRE);
  expect(aller.tenses.plusQueParfait['1sg']).toEqual({ lead: 'j’', forms: ['étais allé', 'étais allée'] });
  expect(aller.tenses.plusQueParfait['1pl']).toEqual({ lead: 'nous', forms: ['étions allés', 'étions allées'] });
  expect(aller.tenses.plusQueParfait['2pl']).toEqual({
    lead: 'vous',
    forms: ['étiez allés', 'étiez allées', 'étiez allé', 'étiez allée'],
  });
  expect(aller.tenses.futurAnterieur['1sg']).toEqual({ lead: 'je', forms: ['serai allé', 'serai allée'] });
  expect(aller.tenses.futurAnterieur['3sg']).toEqual({ lead: 'il/elle', forms: ['sera allé', 'sera allée'] });
  expect(aller.tenses.conditionnelPasse['1sg']).toEqual({ lead: 'je', forms: ['serais allé', 'serais allée'] });
  expect(aller.tenses.conditionnelPasse['2pl']).toEqual({
    lead: 'vous',
    forms: ['seriez allés', 'seriez allées', 'seriez allé', 'seriez allée'],
  });
  expect(aller.tenses.subjonctifPasse['1sg']).toEqual({ lead: 'que je', forms: ['sois allé', 'sois allée'] });
  expect(aller.tenses.subjonctifPasse['3sg']).toEqual({ lead: 'qu’il/elle', forms: ['soit allé', 'soit allée'] });
});

test('a pronominal verb: the reflexive comes from the lead, elided only before a vowel', () => {
  const appeler = verbOf(PRONOMINAL);
  expect(appeler.tenses.plusQueParfait['1sg']).toEqual({ lead: 'je m’', forms: ['étais appelé', 'étais appelée'] });
  expect(appeler.tenses.plusQueParfait['3pl']).toEqual({
    lead: 'ils/elles s’',
    forms: ['étaient appelés', 'étaient appelées'],
  });
  // `serai`, `serais` and `sois` start with a consonant, so the reflexive keeps its e.
  expect(appeler.tenses.futurAnterieur['1sg']).toEqual({ lead: 'je me', forms: ['serai appelé', 'serai appelée'] });
  expect(appeler.tenses.conditionnelPasse['1sg']).toEqual({
    lead: 'je me',
    forms: ['serais appelé', 'serais appelée'],
  });
  expect(appeler.tenses.subjonctifPasse['1sg']).toEqual({ lead: 'que je me', forms: ['sois appelé', 'sois appelée'] });
  expect(appeler.tenses.subjonctifPasse['3sg']).toEqual({
    lead: 'qu’il/elle se',
    forms: ['soit appelé', 'soit appelée'],
  });
  expect(appeler.tenses.subjonctifPasse['2pl']).toEqual({
    lead: 'que vous vous',
    forms: ['soyez appelés', 'soyez appelées', 'soyez appelé', 'soyez appelée'],
  });
});

test('h: the elision falls on the auxiliary, so an aspirated h changes nothing in a compound tense', () => {
  expect(verbOf(H_MUET).tenses.plusQueParfait['1sg']).toEqual({ lead: 'j’', forms: ['avais habité'] });
  expect(verbOf(H_MUET).tenses.subjonctifPasse['1sg']).toEqual({ lead: 'que j’', forms: ['aie habité'] });
  // No auxiliary form starts with h, so the aspirated h of the infinitive never reaches a compound lead.
  expect(verbOf(H_ASPIRE).tenses.plusQueParfait['1sg']).toEqual({ lead: 'j’', forms: ['avais harcelé'] });
  expect(verbOf(H_ASPIRE).tenses.subjonctifPasse['1sg']).toEqual({ lead: 'que j’', forms: ['aie harcelé'] });
});

test('only the subjonctif passé takes que; the other three read as a plain lead', () => {
  for (const spec of [AVOIR, ETRE, PRONOMINAL, H_MUET, H_ASPIRE] as VerbSpec[]) {
    const verb = verbOf(spec);
    for (const tense of COMPOUND_TENSES.filter((name) => name !== 'subjonctifPasse'))
      for (const person of PERSONS) expect(verb.tenses[tense][person]!.lead).not.toContain('que');
    for (const person of PERSONS)
      expect(
        verb.tenses.subjonctifPasse[person]!.lead.startsWith(person === '3sg' || person === '3pl' ? 'qu' : 'que'),
      ).toBe(true);
  }
});

test('each compound tense takes the auxiliary tense COMPOUND_AUX names', () => {
  const verb = verbOf(AVOIR);
  for (const tense of COMPOUND_TENSES) {
    // The auxiliary form is the whole verb group up to the participle, so a wrong mapping shows here.
    const aux = COMPOUND_AUX[tense];
    const first = verb.tenses[tense]['1sg']!.forms[0]!.split(' ')[0]!;
    const expected = {
      passeCompose: 'ai',
      plusQueParfait: 'avais',
      futurAnterieur: 'aurai',
      conditionnelPasse: 'aurais',
      subjonctifPasse: 'aie',
    }[tense];
    expect({ tense, aux, first }).toEqual({ tense, aux, first: expected });
  }
});

test('the seven tenses that came before keep their cells byte for byte', () => {
  const parler = verbOf(AVOIR);
  expect(sayTense(parler, 'present')).toEqual([
    'je parle',
    'tu parles',
    'il/elle parle',
    'nous parlons',
    'vous parlez',
    'ils/elles parlent',
  ]);
  expect(sayTense(parler, 'passeCompose')).toEqual([
    'j’ai parlé',
    'tu as parlé',
    'il/elle a parlé',
    'nous avons parlé',
    'vous avez parlé',
    'ils/elles ont parlé',
  ]);
  expect(sayTense(parler, 'imparfait')).toEqual([
    'je parlais',
    'tu parlais',
    'il/elle parlait',
    'nous parlions',
    'vous parliez',
    'ils/elles parlaient',
  ]);
  expect(sayTense(parler, 'futur')).toEqual([
    'je parlerai',
    'tu parleras',
    'il/elle parlera',
    'nous parlerons',
    'vous parlerez',
    'ils/elles parleront',
  ]);
  expect(sayTense(parler, 'conditionnel')).toEqual([
    'je parlerais',
    'tu parlerais',
    'il/elle parlerait',
    'nous parlerions',
    'vous parleriez',
    'ils/elles parleraient',
  ]);
  expect(sayTense(parler, 'subjonctif')).toEqual([
    'que je parle',
    'que tu parles',
    'qu’il/elle parle',
    'que nous parlions',
    'que vous parliez',
    'qu’ils/elles parlent',
  ]);
  expect(parler.tenses.imperatif).toMatchObject({
    '2sg': { lead: '', forms: ['parle'] },
    '1pl': { lead: '', forms: ['parlons'] },
    '2pl': { lead: '', forms: ['parlez'] },
  });
  // The être control keeps its agreement variants and its polite singular vous.
  const aller = verbOf(ETRE);
  expect(aller.tenses.passeCompose['1sg']!.forms).toEqual(['suis allé', 'suis allée']);
  expect(aller.tenses.passeCompose['2pl']!.forms).toEqual(['êtes allés', 'êtes allées', 'êtes allé', 'êtes allée']);
  expect(aller.tenses.passeCompose['3pl']).toEqual({ lead: 'ils/elles', forms: ['sont allés', 'sont allées'] });
});

test('every compound tense has six persons and no empty lead', () => {
  const generated: GeneratedVerb[] = [AVOIR, ETRE, PRONOMINAL, H_MUET, H_ASPIRE].map((spec) => generate(spec));
  for (const { verb } of generated)
    for (const tense of COMPOUND_TENSES)
      for (const person of PERSONS) {
        const cell = verb.tenses[tense][person];
        expect(cell?.forms.length).toBeGreaterThan(0);
        expect(cell?.lead).not.toBe('');
      }
});
