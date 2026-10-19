/** Regression tests for the owner's engine decisions: rule misfits, û agreement and polite singular vous. */
import { expect, test } from 'bun:test';
import { checkVerb } from '../scripts/grammar-pack/checks';
import { generateVerb } from '../src/services/conjugation/generate';
import { REGULAR_RULES, pastParticiples } from '../src/services/conjugation/rules';
import { verifyAnswer } from '../src/services/conjugation/verify';
import { erAnswer } from './fixtures/conjugationAnswer';
import { generateControls } from './fixtures/grammarPackVerbs';

for (const [infinitive, base, third] of [
  ['vendre', 'vend', 'vend'],
  ['attendre', 'attend', 'attend'],
  ['rompre', 'romp', 'rompt'],
  ['interrompre', 'interromp', 'interrompt'],
]) {
  test(`${infinitive}: re-regular generates the singular present and fits verification`, () => {
    const generated = generateVerb({ id: infinitive, infinitive, base, rule: 're-regular', aux: 'avoir' }, {});
    expect(generated.verb.tenses.present['3sg']).toEqual({ lead: 'il/elle', forms: [third] });
    expect(checkVerb(generated)).toEqual([]);
    const answer = erAnswer(infinitive, 're-regular', { plain: base, strong: base, fut: `${base}r` });
    answer.forms.present = {
      '1sg': [`${base}s`],
      '2sg': [`${base}s`],
      '3sg': [third],
      '1pl': [`${base}ons`],
      '2pl': [`${base}ez`],
      '3pl': [`${base}ent`],
    };
    answer.forms.imperatif = { '2sg': [`${base}s`], '1pl': [`${base}ons`], '2pl': [`${base}ez`] };
    answer.participles.past = { ms: `${base}u`, fs: `${base}ue`, mp: `${base}us`, fp: `${base}ues` };
    expect(verifyAnswer(answer).status).toBe('rule-checked');
  });
}

test('mettre is a re-regular stem misfit, naming the stem', () => {
  expect(() => REGULAR_RULES['re-regular']('mett')).toThrow('the stem "mett" does not end with d or p');
});

test('er-eler-double only doubles l and t', () => {
  expect(REGULAR_RULES['er-eler-double']('appel').present('3sg')).toEqual(['appell']);
  expect(REGULAR_RULES['er-eler-double']('jet').present('3sg')).toEqual(['jett']);
  expect(() => REGULAR_RULES['er-eler-double']('lev')).toThrow('the stem "lev" does not end with l or t');
});

for (const [ms, fs, mp, fp] of [
  ['dû', 'due', 'dus', 'dues'],
  ['mû', 'mue', 'mus', 'mues'],
  ['crû', 'crue', 'crus', 'crues'],
  ['parlé', 'parlée', 'parlés', 'parlées'],
  ['pris', 'prise', 'pris', 'prises'],
  ['été', 'été', 'été', 'été'],
  ['fallu', 'fallu', 'fallu', 'fallu'],
  ['plu', 'plu', 'plu', 'plu'],
]) {
  test(`${ms}: participle agreement`, () => {
    expect(pastParticiples(ms)).toEqual({ ms, fs, mp, fp });
  });
}

test('vous has plural variants first, then polite singular, including reflexive lead', () => {
  const controls = generateControls();
  expect(controls[1].verb.tenses.passeCompose['2pl']).toEqual({
    lead: 'vous',
    forms: ['êtes allés', 'êtes allées', 'êtes allé', 'êtes allée'],
  });
  expect(controls[3].verb.tenses.passeCompose['2pl']).toEqual({
    lead: 'vous vous',
    forms: ['êtes appelés', 'êtes appelées', 'êtes appelé', 'êtes appelée'],
  });
  expect(controls[2].verb.tenses.passeCompose['2pl']?.forms).toEqual(['avez eu']);
  const invariable = generateVerb(
    {
      id: 'se-rappeler',
      infinitive: 'se rappeler',
      base: 'rappel',
      rule: 'er-eler-double',
      aux: 'etre',
      pcInvariable: true,
    },
    {},
  );
  expect(invariable.verb.tenses.passeCompose['2pl']).toEqual({ lead: 'vous vous', forms: ['êtes rappelé'] });
  expect(checkVerb(invariable)).toEqual([]);
});
