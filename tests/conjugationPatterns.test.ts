/**
 * Goldens of the author's unverified F6 statements, not proof of French.
 * Owns pattern and unelided-cell contracts; no AI requests or linguistic extensions.
 */
import { expect, test } from 'bun:test';
import { cellParts, type CellParts } from '../src/services/conjugation/cellParts';
import {
  estCeQue,
  inversion,
  negation,
  patternNote,
  takesQuestion,
  type PatternName,
} from '../src/services/conjugation/patterns';
import { verifyAnswer, verifyPackVerb } from '../src/services/conjugation/verify';
import { FINITE_PERSONS, TENSES, type Person, type Tense, type Verb } from '../src/types/grammarPack';
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
  ['estCeQue', 'aimer', 'present', '1sg', 'est-ce que j’aime\u00a0?'],
  ['estCeQue', 'parler', 'present', '3sg', 'est-ce qu’il/elle parle\u00a0?'],
  ['estCeQue', 'se lever', 'present', '1sg', 'est-ce que je me lève\u00a0?'],
  ['estCeQue', 'aimer', 'passeCompose', '1sg', 'est-ce que j’ai aimé\u00a0?'],
  ['inversion', 'parler', 'present', '2sg', 'parles-tu\u00a0?'],
  ['inversion', 'parler', 'present', '1pl', 'parlons-nous\u00a0?'],
  ['inversion', 'parler', 'present', '2pl', 'parlez-vous\u00a0?'],
  ['inversion', 'parler', 'present', '3pl', 'parlent-ils\u00a0? / parlent-elles\u00a0?'],
  ['inversion', 'parler', 'present', '3sg', 'parle-t-il\u00a0? / parle-t-elle\u00a0?'],
  ['inversion', 'avoir', 'present', '3sg', 'a-t-il\u00a0? / a-t-elle\u00a0?'],
  ['inversion', 'aller', 'present', '3sg', 'va-t-il\u00a0? / va-t-elle\u00a0?'],
  ['inversion', 'être', 'present', '3sg', 'est-il\u00a0? / est-elle\u00a0?'],
  ['inversion', 'parler', 'passeCompose', '2sg', 'as-tu parlé\u00a0?'],
  ['inversion', 'parler', 'passeCompose', '3sg', 'a-t-il parlé\u00a0? / a-t-elle parlé\u00a0?'],
  ['inversion', 'aller', 'passeCompose', '3sg', 'est-il allé\u00a0? / est-elle allée\u00a0?'],
  ['inversion', 'se lever', 'present', '2sg', 'te lèves-tu\u00a0?'],
  ['inversion', 'se lever', 'present', '3sg', 'se lève-t-il\u00a0? / se lève-t-elle\u00a0?'],
  ['inversion', 'se lever', 'passeCompose', '2sg', 't’es-tu levé / levée\u00a0?'],
  ['inversion', 'se lever', 'passeCompose', '3sg', 's’est-il levé\u00a0? / s’est-elle levée\u00a0?'],
  ['inversion', 'aller', 'passeCompose', '2pl', 'êtes-vous allés / allées / allé / allée\u00a0?'],
  ['inversion', 's’appeler', 'passeCompose', '3pl', 'se sont-ils appelés\u00a0? / se sont-elles appelées\u00a0?'],
  ['inversion', 'aller', 'present', '1sg', undefined],
  ['estCeQue', 'aller', 'subjonctif', '3sg', undefined],
  ['inversion', 'aller', 'subjonctif', '3sg', undefined],
  ['estCeQue', 'aller', 'imperatif', '2sg', undefined],
  ['inversion', 'aller', 'imperatif', '2sg', undefined],
  ['negation', 'falloir', 'present', '3sg', 'il ne faut pas'],
  ['estCeQue', 'falloir', 'present', '3sg', 'est-ce qu’il faut\u00a0?'],
  ['inversion', 'falloir', 'present', '3sg', 'faut-il\u00a0?'],
  ['estCeQue', 'parler', 'present', '3pl', 'est-ce qu’ils/elles parlent\u00a0?'],
  ['inversion', 'aller', 'passeCompose', '3pl', 'sont-ils allés\u00a0? / sont-elles allées\u00a0?'],
  ['negation', 'être', 'imparfait', '1sg', 'je n’étais pas'],
  ['negation', 'aller', 'futur', '1sg', 'je n’irai pas'],
  ['negation', 'aller', 'conditionnel', '1sg', 'je n’irais pas'],
  ['estCeQue', 'aller', 'imparfait', '2sg', 'est-ce que tu allais\u00a0?'],
  ['estCeQue', 'aller', 'futur', '2sg', 'est-ce que tu iras\u00a0?'],
  ['estCeQue', 'aller', 'conditionnel', '2sg', 'est-ce que tu irais\u00a0?'],
  ['inversion', 'aller', 'imparfait', '3sg', 'allait-il\u00a0? / allait-elle\u00a0?'],
  ['inversion', 'aller', 'futur', '3sg', 'ira-t-il\u00a0? / ira-t-elle\u00a0?'],
  ['inversion', 'aller', 'conditionnel', '3sg', 'irait-il\u00a0? / irait-elle\u00a0?'],
  ['negation', 's’appeler', 'subjonctif', '3sg', 'qu’il/elle ne s’appelle pas'],
  ['negation', 's’appeler', 'imperatif', '2sg', 'ne t’appelle pas'],
  ['estCeQue', 'aller', 'present', '1sg', 'est-ce que je vais\u00a0?'],
  ['negation', 'aller', 'present', '1sg', 'je ne vais pas'],
  ['negation', 'parler', 'plusQueParfait', '1sg', 'je n’avais pas parlé'],
  ['estCeQue', 'parler', 'plusQueParfait', '1sg', 'est-ce que j’avais parlé\u00a0?'],
  ['negation', 'se lever', 'plusQueParfait', '1sg', 'je ne m’étais pas levé / levée'],
  ['inversion', 'parler', 'plusQueParfait', '2sg', 'avais-tu parlé\u00a0?'],
  ['negation', 'aller', 'futurAnterieur', '1sg', 'je ne serai pas allé / allée'],
  ['negation', 'aller', 'conditionnelPasse', '1sg', 'je ne serais pas allé / allée'],
  ['negation', 'parler', 'subjonctifPasse', '1sg', 'que je n’aie pas parlé'],
  ['negation', 'parler', 'subjonctifPasse', '3sg', 'qu’il/elle n’ait pas parlé'],
  ['estCeQue', 'parler', 'subjonctifPasse', '1sg', undefined],
  ['inversion', 'parler', 'subjonctifPasse', '1sg', undefined],
];
for (const [index, [pattern, verb, tense, person, expected]] of cases.entries()) {
  test(`CP6 golden ${index}: ${pattern} ${verb} ${tense} ${person}`, () => {
    expect(patterns[pattern](cellParts(views[verb], tense, person))).toBe(expected);
  });
}

const edges: [keyof typeof patterns, CellParts, string | undefined][] = [
  [
    'inversion',
    { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['prend'] },
    'prend-il\u00a0? / prend-elle\u00a0?',
  ],
  [
    'inversion',
    { tense: 'present', person: '3pl', subject: 'ils/elles', verb: ['aiment'] },
    'aiment-ils\u00a0? / aiment-elles\u00a0?',
  ],
  ['negation', { tense: 'present', person: '1sg', subject: 'je', verb: ['habite'] }, 'je n’habite pas'],
  ['negation', { tense: 'present', person: '1sg', subject: 'je', verb: ['hurle'], hAspire: true }, 'je ne hurle pas'],
  [
    'estCeQue',
    { tense: 'present', person: '1sg', subject: 'je', verb: ['hurle'], hAspire: true },
    'est-ce que je hurle\u00a0?',
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
    'est-ce que tu paies\u00a0? / est-ce que tu payes\u00a0?',
  ],
  [
    'inversion',
    { tense: 'present', person: '3sg', subject: 'il/elle', verb: ['paie', 'paye'] },
    'paie-t-il\u00a0? / paie-t-elle\u00a0? / paye-t-il\u00a0? / paye-t-elle\u00a0?',
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

test('invariable participles serve both complete inversion sentences', () => {
  expect(inversion(cellParts(fromPack('aller', true), 'passeCompose', '3sg'))).toBe(
    'est-il allé\u00a0? / est-elle allé\u00a0?',
  );
});

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

// The note a row shows and the refusal of the sentence it explains come from one rule (`takesQuestion`).
const questions: PatternName[] = ['estCeQue', 'inversion'];
for (const tense of ['subjonctif', 'subjonctifPasse', 'imperatif'] as const)
  for (const name of questions)
    for (const person of FINITE_PERSONS) {
      test(`CP6 note ${name} ${tense} ${person} says no questions`, () => {
        expect(patternNote(name, tense, person)).toBe('noQuestions');
      });
    }
for (const tense of TENSES)
  for (const person of FINITE_PERSONS) {
    test(`CP6 note negation ${tense} ${person} never says no questions`, () => {
      expect(patternNote('negation', tense, person)).not.toBe('noQuestions');
    });
  }
test('CP6 note inversion present 1sg sends je to est-ce que', () => {
  expect(patternNote('inversion', 'present', '1sg')).toBe('noJe');
});
for (const person of ['2sg', '3sg', '1pl', '2pl', '3pl'] as const) {
  test(`CP6 note inversion present ${person} is not covered`, () => {
    expect(patternNote('inversion', 'present', person)).toBe('notCovered');
  });
}

test('CP6 note: takesQuestion agrees with estCeQue for every tense of a reviewed verb', () => {
  for (const tense of TENSES) {
    if (tense === 'imperatif') {
      expect(takesQuestion(tense)).toBe(estCeQue(cellParts(views.parler, tense, '2sg')) !== undefined);
      continue;
    }
    expect(takesQuestion(tense)).toBe(estCeQue(cellParts(views.parler, tense, '3sg')) !== undefined);
  }
});
