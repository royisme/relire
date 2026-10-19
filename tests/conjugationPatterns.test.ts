/**
 * Goldens of the author's unverified F6 statements, not proof of French.
 * Owns pattern and unelided-cell contracts; no AI requests or linguistic extensions.
 */
import { expect, test } from 'bun:test';
import { cellParts, type CellParts } from '../src/services/conjugation/cellParts';
import { estCeQue, inversion, negation } from '../src/services/conjugation/patterns';
import { verifyAnswer, verifyPackVerb } from '../src/services/conjugation/verify';
import type { Person, Tense, Verb } from '../src/types/grammarPack';
import { answerFromGolden, erAnswer, falloirAnswer, parlerAnswer } from './fixtures/conjugationAnswer';
import { GOLDEN } from './fixtures/grammarPackGolden';

const fromPack = (id: string, pcInvariable?: true) =>
  verifyPackVerb({
    ...GOLDEN[id],
    ...(pcInvariable && { pcInvariable }),
    prov: {
      origin: 'human',
      checkedAgainst: ['human'],
      status: 'reviewed',
      checkedAt: '2026-10-18',
      reviewedBy: 'TEST ONLY',
    },
  } as Verb);
const views = {
  parler: verifyAnswer(parlerAnswer()),
  aimer: verifyAnswer(erAnswer('aimer', 'er-regular', { plain: 'aim', strong: 'aim', fut: 'aimer' })),
  aller: fromPack('aller'),
  être: fromPack('etre'),
  avoir: fromPack('avoir'),
  'se lever': verifyAnswer(erAnswer('se lever', 'er-e-grave', { plain: 'lev', strong: 'lèv', fut: 'lèver' })),
  's’appeler': fromPack('s-appeler'),
  falloir: verifyAnswer(falloirAnswer()),
};
const patterns = { negation, estCeQue, inversion };
type Case = [keyof typeof patterns, keyof typeof views, Tense, Person, string | undefined];
const cases: Case[] = [
  ['negation', 'aimer', 'present', '1sg', 'je n’aime pas'],
  ['negation', 'parler', 'present', '2sg', 'tu ne parles pas'],
  ['negation', 'se lever', 'present', '1sg', 'je ne me lève pas'],
  ['negation', 's’appeler', 'present', '1sg', 'je ne m’appelle pas'],
  ['negation', 'aimer', 'passeCompose', '1sg', 'je n’ai pas aimé'],
  ['negation', 'aller', 'passeCompose', '1sg', 'je ne suis pas allé / allée'],
  ['negation', 'se lever', 'passeCompose', '1sg', 'je ne me suis pas levé / levée'],
  ['negation', 'aller', 'subjonctif', '1sg', 'que je n’aille pas'],
  ['negation', 'parler', 'subjonctif', '3sg', 'qu’il/elle ne parle pas'],
  ['negation', 'parler', 'imperatif', '2sg', 'ne parle pas'],
  ['negation', 'se lever', 'imperatif', '2sg', 'ne te lève pas'],
  ['negation', 'se lever', 'imperatif', '1pl', 'ne nous levons pas'],
  ['negation', 'se lever', 'imperatif', '2pl', 'ne vous levez pas'],
  ['estCeQue', 'aimer', 'present', '1sg', 'est-ce que j’aime?'],
  ['estCeQue', 'parler', 'present', '3sg', 'est-ce qu’il/elle parle?'],
  ['estCeQue', 'se lever', 'present', '1sg', 'est-ce que je me lève?'],
  ['estCeQue', 'aimer', 'passeCompose', '1sg', 'est-ce que j’ai aimé?'],
  ['inversion', 'parler', 'present', '2sg', 'parles-tu?'],
  ['inversion', 'parler', 'present', '1pl', 'parlons-nous?'],
  ['inversion', 'parler', 'present', '2pl', 'parlez-vous?'],
  ['inversion', 'parler', 'present', '3pl', 'parlent-ils/elles?'],
  ['inversion', 'parler', 'present', '3sg', 'parle-t-il/elle?'],
  ['inversion', 'avoir', 'present', '3sg', 'a-t-il/elle?'],
  ['inversion', 'aller', 'present', '3sg', 'va-t-il/elle?'],
  ['inversion', 'être', 'present', '3sg', 'est-il/elle?'],
  ['inversion', 'parler', 'passeCompose', '2sg', 'as-tu parlé?'],
  ['inversion', 'parler', 'passeCompose', '3sg', 'a-t-il/elle parlé?'],
  ['inversion', 'aller', 'passeCompose', '3sg', 'est-il/elle allé / allée?'],
  ['inversion', 'se lever', 'present', '2sg', 'te lèves-tu?'],
  ['inversion', 'se lever', 'present', '3sg', 'se lève-t-il/elle?'],
  ['inversion', 'se lever', 'passeCompose', '2sg', 't’es-tu levé / levée?'],
  ['inversion', 'se lever', 'passeCompose', '3sg', 's’est-il/elle levé / levée?'],
  ['inversion', 'aller', 'present', '1sg', undefined],
  ['estCeQue', 'aller', 'subjonctif', '3sg', undefined],
  ['inversion', 'aller', 'subjonctif', '3sg', undefined],
  ['estCeQue', 'aller', 'imperatif', '2sg', undefined],
  ['inversion', 'aller', 'imperatif', '2sg', undefined],
  ['negation', 'falloir', 'present', '3sg', 'il ne faut pas'],
  ['estCeQue', 'falloir', 'present', '3sg', 'est-ce qu’il faut?'],
  ['inversion', 'falloir', 'present', '3sg', 'faut-il?'],
  ['estCeQue', 'parler', 'present', '3pl', 'est-ce qu’ils/elles parlent?'],
  ['inversion', 'aller', 'passeCompose', '3pl', 'sont-ils/elles allés / allées?'],
  ['negation', 'être', 'imparfait', '1sg', 'je n’étais pas'],
  ['negation', 'aller', 'futur', '1sg', 'je n’irai pas'],
  ['negation', 'aller', 'conditionnel', '1sg', 'je n’irais pas'],
  ['estCeQue', 'aller', 'imparfait', '2sg', 'est-ce que tu allais?'],
  ['estCeQue', 'aller', 'futur', '2sg', 'est-ce que tu iras?'],
  ['estCeQue', 'aller', 'conditionnel', '2sg', 'est-ce que tu irais?'],
  ['inversion', 'aller', 'imparfait', '3sg', 'allait-il/elle?'],
  ['inversion', 'aller', 'futur', '3sg', 'ira-t-il/elle?'],
  ['inversion', 'aller', 'conditionnel', '3sg', 'irait-il/elle?'],
  ['negation', 's’appeler', 'subjonctif', '3sg', 'qu’il/elle ne s’appelle pas'],
  ['negation', 's’appeler', 'imperatif', '2sg', 'ne t’appelle pas'],
  ['estCeQue', 'aller', 'present', '1sg', 'est-ce que je vais?'],
  ['negation', 'aller', 'present', '1sg', 'je ne vais pas'],
];
for (const [index, [pattern, verb, tense, person, expected]] of cases.entries()) {
  test(`CP6 golden ${index}: ${pattern} ${verb} ${tense} ${person}`, () => {
    expect(patterns[pattern](cellParts(views[verb], tense, person))).toBe(expected);
  });
}

const edges: [keyof typeof patterns, CellParts, string | undefined][] = [
  ['inversion', { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['prend'] }, 'prend-il/elle?'],
  ['inversion', { tense: 'present', person: '3pl', subject: 'ils/elles', verb: ['aiment'] }, 'aiment-ils/elles?'],
  ['negation', { tense: 'present', person: '1sg', subject: 'je', verb: ['habite'] }, 'je n’habite pas'],
  ['negation', { tense: 'present', person: '1sg', subject: 'je', verb: ['hurle'], hAspire: true }, 'je ne hurle pas'],
  [
    'estCeQue',
    { tense: 'present', person: '1sg', subject: 'je', verb: ['hurle'], hAspire: true },
    'est-ce que je hurle?',
  ],
  [
    'negation',
    { tense: 'present', person: '1sg', subject: 'je', reflexive: 'me', verb: ['habille'] },
    'je ne m’habille pas',
  ],
  [
    'negation',
    { tense: 'present', person: '2sg', subject: 'tu', verb: ['paies', 'payes'] },
    'tu ne paies pas / tu ne payes pas',
  ],
  [
    'estCeQue',
    { tense: 'present', person: '2sg', subject: 'tu', verb: ['paies', 'payes'] },
    'est-ce que tu paies? / est-ce que tu payes?',
  ],
  [
    'inversion',
    { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['paie', 'paye'] },
    'paie-t-il/elle? / paye-t-il/elle?',
  ],
  ...(['negation', 'estCeQue', 'inversion'] as const).map((pattern): [typeof pattern, CellParts, undefined] => [
    pattern,
    { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['y...'] },
    undefined,
  ]),
  ['inversion', { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['...y'] }, undefined],
];
for (const [index, [pattern, parts, expected]] of edges.entries()) {
  test(`CP6 edge ${index}: ${pattern}`, () => {
    expect(patterns[pattern](parts)).toBe(expected);
  });
}

const partsCases: [string, ReturnType<typeof cellParts>, CellParts][] = [
  [
    'unelided je',
    cellParts(views.aimer, 'present', '1sg'),
    { tense: 'present', person: '1sg', subject: 'je', verb: ['aime'] },
  ],
  [
    'unelided reflexive',
    cellParts(views['s’appeler'], 'present', '1sg'),
    { tense: 'present', person: '1sg', subject: 'je', reflexive: 'me', verb: ['appelle'] },
  ],
  [
    'pack compound',
    cellParts(views.aller, 'passeCompose', '3pl'),
    {
      tense: 'passeCompose',
      person: '3pl',
      subject: 'ils/elles',
      aux: 'sont',
      verb: [],
      participle: ['allés', 'allées'],
    },
  ],
  [
    'AI compound',
    cellParts(views['se lever'], 'passeCompose', '2sg'),
    {
      tense: 'passeCompose',
      person: '2sg',
      subject: 'tu',
      reflexive: 'te',
      aux: 'es',
      verb: [],
      participle: ['levé', 'levée'],
    },
  ],
  [
    'clitic removed',
    cellParts(views['s’appeler'], 'imperatif', '2sg'),
    { tense: 'imperatif', person: '2sg', subject: 'tu', reflexive: 'te', verb: ['appelle'] },
  ],
  [
    'impersonal',
    cellParts(views.falloir, 'present', '3sg'),
    { tense: 'present', person: '3sg', subject: 'il', verb: ['faut'] },
  ],
  [
    'no split compound',
    cellParts(
      {
        ...views.aller,
        tenses: {
          ...views.aller.tenses,
          passeCompose: { '3pl': { lead: 'ignored', forms: ['not a parseable compound'], status: 'reviewed' } },
        },
      },
      'passeCompose',
      '3pl',
    ),
    {
      tense: 'passeCompose',
      person: '3pl',
      subject: 'ils/elles',
      aux: 'sont',
      verb: [],
      participle: ['allés', 'allées'],
    },
  ],
  [
    'invariable',
    cellParts(fromPack('aller', true), 'passeCompose', '3pl'),
    { tense: 'passeCompose', person: '3pl', subject: 'ils/elles', aux: 'sont', verb: [], participle: ['allé'] },
  ],
  [
    'h metadata',
    cellParts(
      verifyAnswer({
        ...erAnswer('hurler', 'er-regular', { plain: 'hurl', strong: 'hurl', fut: 'hurler' }),
        hAspire: true,
      }),
      'present',
      '1sg',
    ),
    { tense: 'present', person: '1sg', subject: 'je', verb: ['hurle'], hAspire: true },
  ],
];
for (const [index, [name, actual, expected]] of partsCases.entries()) {
  test(`CP6 parts ${index}: ${name}`, () => {
    expect(actual).toEqual(expected);
  });
}

// AI assembly must preserve the same structured contract as the pack, with no new AI call.
test('CP6 parts 9: AI golden compound', () => {
  expect(cellParts(verifyAnswer(answerFromGolden('aller')), 'passeCompose', '1sg')).toEqual({
    tense: 'passeCompose',
    person: '1sg',
    subject: 'je',
    aux: 'suis',
    verb: [],
    participle: ['allé', 'allée'],
  });
});
