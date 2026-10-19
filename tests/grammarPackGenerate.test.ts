import { expect, test } from 'bun:test';
import { cellAt, checkControls, checkVerb } from '../scripts/grammar-pack/checks';
import type { VerbSpec } from '../src/services/conjugation/generate';
import { composeLead } from '../src/services/conjugation/rules';
import {
  FINITE_PERSONS,
  IMPERATIVE_PERSONS,
  RuleIdSchema,
  type Tense,
  type RuleId,
  type Verb,
} from '../src/types/grammarPack';
import { CONTROL_SPECS, generate, generateControls } from './fixtures/grammarPackVerbs';

/** What a learner reads: lead and primary form, no space after an elided lead. */
const say = ({ lead, forms }: { lead: string; forms: string[] }) =>
  lead === '' || lead.endsWith('’') ? lead + forms[0] : `${lead} ${forms[0]}`;
const sayTense = (verb: Verb, tense: Tense) => Object.values(verb.tenses[tense] ?? {}).map(say);
const sayParticiples = ({ participles: { present, past } }: Verb) =>
  [present, past.ms, past.fs, past.mp, past.fp].join(' ');
const list = (text: string) => text.split(', ');

interface Case {
  spec: VerbSpec;
  present: string;
  imparfait: string;
  futur: string;
  conditionnel: string;
  subjonctif: string;
  imperatif: string;
  participles: string;
}

// Expectations are typed by hand from French grammar, not from the rules under test.
const CASES: Record<string, Case> = {
  parler: {
    spec: { id: 'parler', infinitive: 'parler', base: 'parl', rule: 'er-regular', aux: 'avoir' },
    present: 'je parle, tu parles, il/elle parle, nous parlons, vous parlez, ils/elles parlent',
    imparfait: 'je parlais, tu parlais, il/elle parlait, nous parlions, vous parliez, ils/elles parlaient',
    futur: 'je parlerai, tu parleras, il/elle parlera, nous parlerons, vous parlerez, ils/elles parleront',
    conditionnel:
      'je parlerais, tu parlerais, il/elle parlerait, nous parlerions, vous parleriez, ils/elles parleraient',
    subjonctif:
      'que je parle, que tu parles, qu’il/elle parle, que nous parlions, que vous parliez, qu’ils/elles parlent',
    imperatif: 'parle, parlons, parlez',
    participles: 'parlant parlé parlée parlés parlées',
  },
  commencer: {
    spec: { id: 'commencer', infinitive: 'commencer', base: 'commenc', rule: 'er-cer', aux: 'avoir' },
    present: 'je commence, tu commences, il/elle commence, nous commençons, vous commencez, ils/elles commencent',
    imparfait:
      'je commençais, tu commençais, il/elle commençait, nous commencions, vous commenciez, ils/elles commençaient',
    futur:
      'je commencerai, tu commenceras, il/elle commencera, nous commencerons, vous commencerez, ils/elles commenceront',
    conditionnel: 'je commencerais',
    subjonctif:
      'que je commence, que tu commences, qu’il/elle commence, que nous commencions, que vous commenciez, qu’ils/elles commencent',
    imperatif: 'commence, commençons, commencez',
    participles: 'commençant commencé commencée commencés commencées',
  },
  manger: {
    spec: { id: 'manger', infinitive: 'manger', base: 'mang', rule: 'er-ger', aux: 'avoir' },
    present: 'je mange, tu manges, il/elle mange, nous mangeons, vous mangez, ils/elles mangent',
    imparfait: 'je mangeais, tu mangeais, il/elle mangeait, nous mangions, vous mangiez, ils/elles mangeaient',
    futur: 'je mangerai, tu mangeras, il/elle mangera, nous mangerons, vous mangerez, ils/elles mangeront',
    conditionnel: 'je mangerais',
    subjonctif:
      'que je mange, que tu manges, qu’il/elle mange, que nous mangions, que vous mangiez, qu’ils/elles mangent',
    imperatif: 'mange, mangeons, mangez',
    participles: 'mangeant mangé mangée mangés mangées',
  },
  's-ennuyer': {
    spec: { id: 's-ennuyer', infinitive: 's’ennuyer', base: 'ennuy', rule: 'er-yer-i', aux: 'etre' },
    present: 'je m’ennuie, tu t’ennuies, il/elle s’ennuie, nous nous ennuyons, vous vous ennuyez, ils/elles s’ennuient',
    imparfait:
      'je m’ennuyais, tu t’ennuyais, il/elle s’ennuyait, nous nous ennuyions, vous vous ennuyiez, ils/elles s’ennuyaient',
    futur:
      'je m’ennuierai, tu t’ennuieras, il/elle s’ennuiera, nous nous ennuierons, vous vous ennuierez, ils/elles s’ennuieront',
    conditionnel: 'je m’ennuierais',
    subjonctif:
      'que je m’ennuie, que tu t’ennuies, qu’il/elle s’ennuie, que nous nous ennuyions, que vous vous ennuyiez, qu’ils/elles s’ennuient',
    imperatif: 'ennuie-toi, ennuyons-nous, ennuyez-vous',
    participles: 'ennuyant ennuyé ennuyée ennuyés ennuyées',
  },
  'se-lever': {
    spec: { id: 'se-lever', infinitive: 'se lever', base: 'lev', rule: 'er-e-grave', aux: 'etre' },
    present: 'je me lève, tu te lèves, il/elle se lève, nous nous levons, vous vous levez, ils/elles se lèvent',
    imparfait:
      'je me levais, tu te levais, il/elle se levait, nous nous levions, vous vous leviez, ils/elles se levaient',
    futur:
      'je me lèverai, tu te lèveras, il/elle se lèvera, nous nous lèverons, vous vous lèverez, ils/elles se lèveront',
    conditionnel: 'je me lèverais',
    subjonctif:
      'que je me lève, que tu te lèves, qu’il/elle se lève, que nous nous levions, que vous vous leviez, qu’ils/elles se lèvent',
    imperatif: 'lève-toi, levons-nous, levez-vous',
    participles: 'levant levé levée levés levées',
  },
  acheter: {
    spec: { id: 'acheter', infinitive: 'acheter', base: 'achet', rule: 'er-e-grave', aux: 'avoir' },
    present: 'j’achète, tu achètes, il/elle achète, nous achetons, vous achetez, ils/elles achètent',
    imparfait: 'j’achetais, tu achetais, il/elle achetait, nous achetions, vous achetiez, ils/elles achetaient',
    futur: 'j’achèterai, tu achèteras, il/elle achètera, nous achèterons, vous achèterez, ils/elles achèteront',
    conditionnel: 'j’achèterais',
    subjonctif:
      'que j’achète, que tu achètes, qu’il/elle achète, que nous achetions, que vous achetiez, qu’ils/elles achètent',
    imperatif: 'achète, achetons, achetez',
    participles: 'achetant acheté achetée achetés achetées',
  },
  préférer: {
    spec: { id: 'preferer', infinitive: 'préférer', base: 'préfér', rule: 'er-eacute-egrave', aux: 'avoir' },
    present: 'je préfère, tu préfères, il/elle préfère, nous préférons, vous préférez, ils/elles préfèrent',
    imparfait: 'je préférais, tu préférais, il/elle préférait, nous préférions, vous préfériez, ils/elles préféraient',
    futur: 'je préférerai, tu préféreras, il/elle préférera, nous préférerons, vous préférerez, ils/elles préféreront',
    conditionnel: 'je préférerais',
    subjonctif:
      'que je préfère, que tu préfères, qu’il/elle préfère, que nous préférions, que vous préfériez, qu’ils/elles préfèrent',
    imperatif: 'préfère, préférons, préférez',
    participles: 'préférant préféré préférée préférés préférées',
  },
  appeler: {
    spec: { id: 'appeler', infinitive: 'appeler', base: 'appel', rule: 'er-eler-double', aux: 'avoir' },
    present: 'j’appelle, tu appelles, il/elle appelle, nous appelons, vous appelez, ils/elles appellent',
    imparfait: 'j’appelais, tu appelais, il/elle appelait, nous appelions, vous appeliez, ils/elles appelaient',
    futur: 'j’appellerai, tu appelleras, il/elle appellera, nous appellerons, vous appellerez, ils/elles appelleront',
    conditionnel: 'j’appellerais',
    subjonctif:
      'que j’appelle, que tu appelles, qu’il/elle appelle, que nous appelions, que vous appeliez, qu’ils/elles appellent',
    imperatif: 'appelle, appelons, appelez',
    participles: 'appelant appelé appelée appelés appelées',
  },
  jeter: {
    spec: { id: 'jeter', infinitive: 'jeter', base: 'jet', rule: 'er-eler-double', aux: 'avoir' },
    present: 'je jette, tu jettes, il/elle jette, nous jetons, vous jetez, ils/elles jettent',
    imparfait: 'je jetais, tu jetais, il/elle jetait, nous jetions, vous jetiez, ils/elles jetaient',
    futur: 'je jetterai, tu jetteras, il/elle jettera, nous jetterons, vous jetterez, ils/elles jetteront',
    conditionnel: 'je jetterais',
    subjonctif:
      'que je jette, que tu jettes, qu’il/elle jette, que nous jetions, que vous jetiez, qu’ils/elles jettent',
    imperatif: 'jette, jetons, jetez',
    participles: 'jetant jeté jetée jetés jetées',
  },
  choisir: {
    spec: { id: 'choisir', infinitive: 'choisir', base: 'chois', rule: 'ir-issons', aux: 'avoir' },
    present: 'je choisis, tu choisis, il/elle choisit, nous choisissons, vous choisissez, ils/elles choisissent',
    imparfait:
      'je choisissais, tu choisissais, il/elle choisissait, nous choisissions, vous choisissiez, ils/elles choisissaient',
    futur: 'je choisirai, tu choisiras, il/elle choisira, nous choisirons, vous choisirez, ils/elles choisiront',
    conditionnel: 'je choisirais',
    subjonctif:
      'que je choisisse, que tu choisisses, qu’il/elle choisisse, que nous choisissions, que vous choisissiez, qu’ils/elles choisissent',
    imperatif: 'choisis, choisissons, choisissez',
    participles: 'choisissant choisi choisie choisis choisies',
  },
  sortir: {
    spec: { id: 'sortir', infinitive: 'sortir', base: 'sort', rule: 'ir-sortir', aux: 'etre' },
    present: 'je sors, tu sors, il/elle sort, nous sortons, vous sortez, ils/elles sortent',
    imparfait: 'je sortais, tu sortais, il/elle sortait, nous sortions, vous sortiez, ils/elles sortaient',
    futur: 'je sortirai, tu sortiras, il/elle sortira, nous sortirons, vous sortirez, ils/elles sortiront',
    conditionnel: 'je sortirais',
    subjonctif:
      'que je sorte, que tu sortes, qu’il/elle sorte, que nous sortions, que vous sortiez, qu’ils/elles sortent',
    imperatif: 'sors, sortons, sortez',
    participles: 'sortant sorti sortie sortis sorties',
  },
  ouvrir: {
    spec: { id: 'ouvrir', infinitive: 'ouvrir', base: 'ouvr', rule: 'ir-ouvrir', aux: 'avoir' },
    present: 'j’ouvre, tu ouvres, il/elle ouvre, nous ouvrons, vous ouvrez, ils/elles ouvrent',
    imparfait: 'j’ouvrais, tu ouvrais, il/elle ouvrait, nous ouvrions, vous ouvriez, ils/elles ouvraient',
    futur: 'j’ouvrirai, tu ouvriras, il/elle ouvrira, nous ouvrirons, vous ouvrirez, ils/elles ouvriront',
    conditionnel: 'j’ouvrirais',
    subjonctif:
      'que j’ouvre, que tu ouvres, qu’il/elle ouvre, que nous ouvrions, que vous ouvriez, qu’ils/elles ouvrent',
    imperatif: 'ouvre, ouvrons, ouvrez',
    participles: 'ouvrant ouvert ouverte ouverts ouvertes',
  },
  vendre: {
    spec: { id: 'vendre', infinitive: 'vendre', base: 'vend', rule: 're-regular', aux: 'avoir' },
    present: 'je vends, tu vends, il/elle vend, nous vendons, vous vendez, ils/elles vendent',
    imparfait: 'je vendais, tu vendais, il/elle vendait, nous vendions, vous vendiez, ils/elles vendaient',
    futur: 'je vendrai, tu vendras, il/elle vendra, nous vendrons, vous vendrez, ils/elles vendront',
    conditionnel: 'je vendrais',
    subjonctif:
      'que je vende, que tu vendes, qu’il/elle vende, que nous vendions, que vous vendiez, qu’ils/elles vendent',
    imperatif: 'vends, vendons, vendez',
    participles: 'vendant vendu vendue vendus vendues',
  },
};

// One row per RuleId: the verbs that prove it. `irregular` is proven by the three irregular controls;
// s’appeler is generated by er-eler-double.
const TEST_VERBS: Record<RuleId, string[]> = {
  'er-regular': ['parler'],
  'er-cer': ['commencer'],
  'er-ger': ['manger'],
  'er-yer-i': ['s-ennuyer'],
  'er-e-grave': ['se-lever', 'acheter'],
  'er-eacute-egrave': ['préférer'],
  'er-eler-double': ['appeler', 'jeter'],
  'ir-issons': ['choisir'],
  'ir-sortir': ['sortir'],
  'ir-ouvrir': ['ouvrir'],
  're-regular': ['vendre'],
  irregular: ['etre', 'aller', 'avoir'],
};

test('control verbs equal their hand-typed goldens in all seven tenses and the participles', () => {
  const controls = generateControls();
  expect(checkControls(controls)).toEqual([]);
  for (const control of controls) expect(checkVerb(control)).toEqual([]);
});

test('every RuleId has its test verb, and each test verb uses that rule', () => {
  for (const ruleId of RuleIdSchema.options) {
    expect(TEST_VERBS[ruleId]?.length).toBeGreaterThan(0);
    for (const name of TEST_VERBS[ruleId]) {
      const spec = CASES[name]?.spec ?? CONTROL_SPECS.find(({ id }) => id === name);
      expect(spec?.rule).toBe(ruleId);
    }
  }
});

for (const [name, expected] of Object.entries(CASES)) {
  test(`${name}: forms, leads and participles follow ${expected.spec.rule}`, () => {
    const generated = generate(expected.spec);
    const { verb } = generated;
    expect(sayTense(verb, 'present')).toEqual(list(expected.present));
    expect(sayTense(verb, 'imparfait')).toEqual(list(expected.imparfait));
    expect(sayTense(verb, 'futur')).toEqual(list(expected.futur));
    expect(sayTense(verb, 'conditionnel').slice(0, list(expected.conditionnel).length)).toEqual(
      list(expected.conditionnel),
    );
    expect(sayTense(verb, 'subjonctif')).toEqual(list(expected.subjonctif));
    expect(sayTense(verb, 'imperatif')).toEqual(list(expected.imperatif));
    expect(sayParticiples(verb)).toBe(expected.participles);
    expect(checkVerb(generated)).toEqual([]);
  });
}

test('essayer keeps both spellings, primary first', () => {
  const { verb } = generate({ id: 'essayer', infinitive: 'essayer', base: 'essay', rule: 'er-yer-i', aux: 'avoir' });
  const forms = (tense: Tense, person: (typeof FINITE_PERSONS)[number]) => cellAt(verb, tense, person)!.forms;
  expect(forms('present', '1sg')).toEqual(['essaie', 'essaye']);
  expect(forms('present', '3pl')).toEqual(['essaient', 'essayent']);
  expect(forms('present', '1pl')).toEqual(['essayons']);
  expect(forms('imparfait', '1sg')).toEqual(['essayais']);
  expect(forms('futur', '1sg')).toEqual(['essaierai', 'essayerai']);
  expect(forms('subjonctif', '1sg')).toEqual(['essaie', 'essaye']);
  expect(forms('imperatif', '2sg')).toEqual(['essaie', 'essaye']);
  expect(verb.tenses.present['1sg']!.lead).toBe('j’');
  expect(
    checkVerb(generate({ id: 'essayer', infinitive: 'essayer', base: 'essay', rule: 'er-yer-i', aux: 'avoir' })),
  ).toEqual([]);
});

test('the lead algorithm: elision, reflexives, subjonctif que, impersonal il', () => {
  const avoir = generate(CONTROL_SPECS[2]).verb;
  const aller = generate(CONTROL_SPECS[1]).verb;
  const appeler = generate(CONTROL_SPECS[3]).verb;
  const falloir = generate({
    id: 'falloir',
    infinitive: 'falloir',
    rule: 'irregular',
    aux: 'avoir',
    defective: 'impersonal',
  }).verb;
  expect(say(avoir.tenses.present['1sg']!)).toBe('j’ai');
  expect(say(appeler.tenses.present['1sg']!)).toBe('je m’appelle');
  expect(say(appeler.tenses.subjonctif['3sg']!)).toBe('qu’il/elle s’appelle');
  expect(say(aller.tenses.subjonctif['1sg']!)).toBe('que j’aille');
  expect(say(falloir.tenses.subjonctif['3sg']!)).toBe('qu’il faille');
  // the nous and vous reflexives never elide
  expect(appeler.tenses.present['1pl']!.lead).toBe('nous nous');
  expect(appeler.tenses.present['2pl']!.lead).toBe('vous vous');
});

test('h: mute elides, aspirated does not', () => {
  const lead = (hAspire: boolean, pronominal: boolean) =>
    composeLead('present', '1sg', { pronominal, hAspire }, 'habille');
  expect(lead(false, false)).toBe('j’');
  expect(lead(true, false)).toBe('je');
  expect(lead(false, true)).toBe('je m’');
  expect(lead(true, true)).toBe('je me');
});

test('imperatif has no lead and pronominal verbs carry the hyphenated clitic', () => {
  const lever = generate(CASES['se-lever'].spec).verb;
  for (const person of IMPERATIVE_PERSONS) expect(lever.tenses.imperatif![person]!.lead).toBe('');
  expect(lever.tenses.imperatif!['2sg']!.forms).toEqual(['lève-toi']);
  expect(lever.tenses.imperatif!['1pl']!.forms).toEqual(['levons-nous']);
  expect(lever.tenses.imperatif!['2pl']!.forms).toEqual(['levez-vous']);
});

test('passé composé: agreement variants, avoir without them, pcInvariable without them', () => {
  const aller = generate(CONTROL_SPECS[1]).verb;
  expect(aller.tenses.passeCompose['1sg']!.forms).toEqual(['suis allé', 'suis allée']);
  expect(aller.tenses.passeCompose['2pl']!.forms).toEqual(['êtes allés', 'êtes allées', 'êtes allé', 'êtes allée']);
  const parler = generate(CASES.parler.spec).verb;
  expect(parler.tenses.passeCompose['1pl']!.forms).toEqual(['avons parlé']);
  const spec: VerbSpec = {
    id: 'se-rappeler',
    infinitive: 'se rappeler',
    base: 'rappel',
    rule: 'er-eler-double',
    aux: 'etre',
    pcInvariable: true,
  };
  const rappeler = generate(spec);
  expect(rappeler.verb.tenses.passeCompose['1sg']).toEqual({ lead: 'je me', forms: ['suis rappelé'] });
  expect(rappeler.verb.tenses.passeCompose['3pl']).toEqual({ lead: 'ils/elles se', forms: ['sont rappelé'] });
  expect(checkVerb(rappeler)).toEqual([]);
});

test('falloir, pleuvoir and se passer only have the cells they can take', () => {
  const falloir = generate({
    id: 'falloir',
    infinitive: 'falloir',
    rule: 'irregular',
    aux: 'avoir',
    defective: 'impersonal',
  });
  expect(Object.keys(falloir.verb.tenses.present)).toEqual(['3sg']);
  expect(falloir.verb.tenses.imperatif).toBeUndefined();
  expect(falloir.verb.participles.present).toBeUndefined();
  expect(sayTense(falloir.verb, 'passeCompose')).toEqual(['il a fallu']);
  expect(sayTense(falloir.verb, 'futur')).toEqual(['il faudra']);
  expect(falloir.verb.participles.past).toEqual({ ms: 'fallu', fs: 'fallu', mp: 'fallu', fp: 'fallu' });
  expect(checkVerb(falloir)).toEqual([]);

  const pleuvoir = generate({
    id: 'pleuvoir',
    infinitive: 'pleuvoir',
    rule: 'irregular',
    aux: 'avoir',
    defective: 'impersonal',
  });
  expect(sayTense(pleuvoir.verb, 'present')).toEqual(['il pleut']);
  expect(sayTense(pleuvoir.verb, 'imparfait')).toEqual(['il pleuvait']);
  expect(sayTense(pleuvoir.verb, 'conditionnel')).toEqual(['il pleuvrait']);
  expect(sayTense(pleuvoir.verb, 'subjonctif')).toEqual(['qu’il pleuve']);
  expect(sayTense(pleuvoir.verb, 'passeCompose')).toEqual(['il a plu']);
  expect(checkVerb(pleuvoir)).toEqual([]);

  const passer = generate({
    id: 'se-passer',
    infinitive: 'se passer',
    base: 'pass',
    rule: 'er-regular',
    aux: 'etre',
    defective: 'third-person',
  });
  expect(Object.keys(passer.verb.tenses.present)).toEqual(['3sg', '3pl']);
  expect(passer.verb.tenses.imperatif).toBeUndefined();
  expect(sayTense(passer.verb, 'present')).toEqual(['il/elle se passe', 'ils/elles se passent']);
  expect(sayTense(passer.verb, 'subjonctif')).toEqual(['qu’il/elle se passe', 'qu’ils/elles se passent']);
  expect(passer.verb.tenses.passeCompose['3sg']).toEqual({ lead: 'il/elle s’', forms: ['est passé', 'est passée'] });
  expect(passer.verb.tenses.passeCompose['3pl']).toEqual({
    lead: 'ils/elles se',
    forms: ['sont passés', 'sont passées'],
  });
  expect(checkVerb(passer)).toEqual([]);
});

test('the generator fails loudly on authored data that cannot be generated', () => {
  expect(() => generate({ id: 'x', infinitive: 'x', rule: 'er-regular', aux: 'avoir' })).toThrow('needs a base');
  expect(() => generate({ id: 'inconnu', infinitive: 'inconnu', rule: 'irregular', aux: 'avoir' })).toThrow(
    'needs forms',
  );
  expect(() =>
    generate({ id: 'inconnu', infinitive: 'inconnir', base: 'inconn', rule: 'ir-ouvrir', aux: 'avoir' }),
  ).toThrow('past participle');
});
