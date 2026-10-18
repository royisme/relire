import { expect, test } from 'bun:test';
import {
  checkControls,
  checkFamily,
  checkImperatif,
  checkLead,
  checkPasseCompose,
  checkSchema,
  checkShape,
  checkStemEnding,
  checkVerb,
} from '../scripts/grammar-pack/checks';
import type { GeneratedVerb } from '../scripts/grammar-pack/generate';
import { generate, generateControls } from './fixtures/grammarPackVerbs';

const verbOf = (id: string, infinitive: string, base: string, rule: 'er-cer' | 'er-ger' | 'ir-issons' | 'er-regular') =>
  generate({ id, infinitive, base, rule, aux: 'avoir' });
const commencer = () => verbOf('commencer', 'commencer', 'commenc', 'er-cer');
const manger = () => verbOf('manger', 'manger', 'mang', 'er-ger');
const controls = () => generateControls();
const aller = () => controls()[1];
const appeler = () => controls()[3];

const mutated = (g: GeneratedVerb, change: (copy: GeneratedVerb) => void) => {
  const copy = structuredClone(g);
  change(copy);
  return copy;
};

test('every check passes the untouched verbs', () => {
  for (const g of [commencer(), manger(), verbOf('choisir', 'choisir', 'chois', 'ir-issons'), ...controls()]) {
    expect(checkVerb(g)).toEqual([]);
  }
});

test('a wrong lead is rejected and named', () => {
  const g = mutated(aller(), (c) => (c.verb.tenses.present['1sg']!.lead = 'j’'));
  expect(checkLead(g)).toEqual(['aller present 1sg: lead "j’" should be "je"']);
});

test('a missing person is rejected and named', () => {
  const g = mutated(aller(), (c) => delete c.verb.tenses.futur['2pl']);
  expect(checkSchema(g).join()).toContain('aller tenses futur 2pl');
});

test('a broken stem + ending is rejected and named', () => {
  const g = mutated(commencer(), (c) => (c.verb.tenses.imparfait['2sg']!.forms = ['commencais']));
  expect(checkStemEnding(g).join()).toContain('commencer imparfait 2sg');
});

test('a wrong auxiliary is rejected and named', () => {
  const g = mutated(aller(), (c) => (c.verb.tenses.passeCompose['1sg']!.forms = ['ai allé', 'ai allée']));
  expect(checkPasseCompose(g).join()).toContain('aller passeCompose 1sg');
});

test('a missing agreement variant is rejected', () => {
  const g = mutated(aller(), (c) => (c.verb.tenses.passeCompose['1pl']!.forms = ['sommes allés']));
  expect(checkPasseCompose(g).join()).toContain('aller passeCompose 1pl');
});

test('ç before e is rejected at the stem/ending boundary', () => {
  const g = mutated(commencer(), (c) => {
    c.parts.simple.present['1sg'] = [{ stem: 'commenç', ending: 'e' }];
    c.verb.tenses.present['1sg']!.forms = ['commençe'];
  });
  expect(checkStemEnding(g)).toEqual([]);
  expect(checkFamily(g).join()).toContain('commencer present 1sg');
});

test('c before a is rejected at the stem/ending boundary', () => {
  const g = mutated(commencer(), (c) => {
    c.parts.simple.present['1pl'] = [{ stem: 'commenc', ending: 'ons' }];
    c.verb.tenses.present['1pl']!.forms = ['commencons'];
  });
  expect(checkFamily(g).join()).toContain('commencer present 1pl');
});

test('ge before i and a missing geons are rejected', () => {
  const g = mutated(manger(), (c) => {
    c.parts.simple.imparfait['1pl'] = [{ stem: 'mange', ending: 'ions' }];
    c.verb.tenses.imparfait['1pl']!.forms = ['mangeions'];
    c.parts.simple.present['1pl'] = [{ stem: 'mang', ending: 'ons' }];
    c.verb.tenses.present['1pl']!.forms = ['mangons'];
  });
  const failures = checkFamily(g).join();
  expect(failures).toContain('manger imparfait 1pl');
  expect(failures).toContain('manger present 1pl');
});

test('an ir-issons verb without issons is rejected', () => {
  const g = mutated(
    verbOf('choisir', 'choisir', 'chois', 'ir-issons'),
    (c) => (c.verb.tenses.subjonctif['1pl']!.forms = ['choisions']),
  );
  expect(checkFamily(g).join()).toContain('choisir subjonctif 1pl');
});

test('an imperatif that does not follow the present is rejected', () => {
  const g = mutated(appeler(), (c) => (c.verb.tenses.imperatif!['2sg']!.forms = ['appelles-toi']));
  expect(checkImperatif(g).join()).toContain('s-appeler imperatif 2sg');
});

test('raw case and whitespace anomalies are rejected although the schema trims', () => {
  const g = mutated(aller(), (c) => {
    c.verb.tenses.present['3sg']!.forms = ['va '];
    c.verb.tenses.present['1sg']!.forms = ['Vais'];
  });
  const failures = checkShape(g).join();
  expect(failures).toContain('aller present 3sg');
  expect(failures).toContain('aller present 1sg');
});

test('a control verb that differs from its golden, or is missing, is rejected', () => {
  const wrong = controls();
  wrong[0].verb.tenses.subjonctif['3sg']!.forms = ['soie'];
  expect(checkControls(wrong).join()).toContain('etre subjonctif 3sg');
  expect(checkControls(controls().slice(1)).join()).toContain('etre: control verb is missing');
});
