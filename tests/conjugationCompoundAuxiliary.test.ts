/**
 * Owns the auxiliary table of the compound tenses (present to subjonctif) and the
 * `que` lead of the subjonctif passé. Does not own the pack tenses (#34 adds
 * them) or the sentence patterns built on `passeComposeParticiples`.
 */
import { expect, test } from 'bun:test';
import irregularsJson from '../data/grammar-pack/irregulars.json';
import {
  AUXILIARY_FORMS,
  CONDITIONNEL_ENDINGS,
  FUTUR_ENDINGS,
  IMPARFAIT_ENDINGS,
  composeLead,
  compoundForms,
  pastParticiples,
  type AuxiliaryTense,
} from '../src/services/conjugation/rules';
import { FINITE_PERSONS } from '../src/types/grammarPack';

/** The reviewed entries of the irregular table, read as the test input they are. */
const REVIEWED = irregularsJson as Record<
  string,
  {
    forms: {
      present: Record<string, string>;
      subjonctif: Record<string, string>;
      imparfaitStem: string;
      futurStem: string;
    };
  }
>;

const reviewedRow = (aux: 'avoir' | 'etre', tense: 'present' | 'subjonctif') =>
  FINITE_PERSONS.map((person) => REVIEWED[aux].forms[tense][person]);

const fromStem = (aux: 'avoir' | 'etre', stem: 'imparfaitStem' | 'futurStem', endings: readonly string[]) => {
  const base = REVIEWED[aux].forms[stem];
  return endings.map((ending) => base + ending);
};

const AUXILIARIES = ['avoir', 'etre'] as const;

for (const aux of AUXILIARIES) {
  test(`${aux}: present and subjonctif equal the reviewed irregular table`, () => {
    expect(AUXILIARY_FORMS[aux].present).toEqual(reviewedRow(aux, 'present'));
    expect(AUXILIARY_FORMS[aux].subjonctif).toEqual(reviewedRow(aux, 'subjonctif'));
  });

  test(`${aux}: imparfait, futur and conditionnel follow from the reviewed stems`, () => {
    expect(AUXILIARY_FORMS[aux].imparfait).toEqual(fromStem(aux, 'imparfaitStem', IMPARFAIT_ENDINGS));
    expect(AUXILIARY_FORMS[aux].futur).toEqual(fromStem(aux, 'futurStem', FUTUR_ENDINGS));
    expect(AUXILIARY_FORMS[aux].conditionnel).toEqual(fromStem(aux, 'futurStem', CONDITIONNEL_ENDINGS));
  });
}

const forme = (aux: 'avoir' | 'etre', tense: AuxiliaryTense, person: Parameters<typeof compoundForms>[2], ms: string) =>
  compoundForms({ aux }, tense, person, pastParticiples(ms));

test('passé composé keeps today’s output, including the polite singular vous', () => {
  expect(forme('avoir', 'present', '1sg', 'mangé')).toEqual(['ai mangé']);
  expect(forme('etre', 'present', '1sg', 'allé')).toEqual(['suis allé', 'suis allée']);
  expect(forme('etre', 'present', '3pl', 'allé')).toEqual(['sont allés', 'sont allées']);
  expect(forme('etre', 'present', '2pl', 'allé')).toEqual(['êtes allés', 'êtes allées', 'êtes allé', 'êtes allée']);
  expect(compoundForms({ aux: 'etre', pcInvariable: true }, 'present', '2pl', pastParticiples('allé'))).toEqual([
    'êtes allé',
  ]);
});

test('the other auxiliary tenses carry the participle agreement through', () => {
  expect(forme('etre', 'imparfait', '1sg', 'allé')).toEqual(['étais allé', 'étais allée']);
  expect(forme('etre', 'futur', '3sg', 'allé')).toEqual(['sera allé', 'sera allée']);
  expect(forme('etre', 'conditionnel', '1pl', 'allé')).toEqual(['serions allés', 'serions allées']);
  expect(forme('avoir', 'subjonctif', '3pl', 'mangé')).toEqual(['aient mangé']);
});

test('the subjonctif passé takes the same que as the subjonctif, the present none', () => {
  const verb = { pronominal: false };
  expect(composeLead('subjonctif', '3sg', verb, 'aille')).toBe('qu’il/elle');
  expect(composeLead('subjonctifPasse', '3sg', verb, 'ait')).toBe('qu’il/elle');
  expect(composeLead('subjonctifPasse', '1sg', verb, 'aie')).toBe('que j’');
  expect(composeLead('present', '3sg', verb, 'aille')).toBe('il/elle');
  expect(composeLead('present', '1sg', verb, 'aie')).toBe('j’');
});
