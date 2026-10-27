/**
 * The guards the transformation kinds added to stop rewriting sentences they cannot build:
 * a sentence that is already negated, an object clitic before the verb, and every être sentence for `number`.
 * Hand-written French and hand-built glossaries, like `readerTransform.test.ts`; TEST entries only.
 */
import { expect, test } from 'bun:test';
import { TRANSFORMERS } from '../src/services/exercises/transform';
import {
  ReaderGlossaryEntrySchema,
  SentenceSchema,
  type ReaderGlossaryEntry,
  type Sentence,
} from '../src/types/gradedReader';

const gloss = (en: string) => `TEST: ${en}`;
const functionEntry = (id: string, lemma: string, forms: string[], sense: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'function',
    sense,
    forms,
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });
const nounEntry = (id: string, lemma: string, gender: 'masculine' | 'feminine'): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'noun',
    sense: 'thing',
    forms: [lemma],
    gender,
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });
const verbEntry = (id: string, lemma: string, forms: string[]): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'verb',
    sense: 'action',
    forms,
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });

const glossary: ReaderGlossaryEntry[] = [
  functionEntry('t-je', 'je', ['j’ai'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-ce', 'ce', ['c’est'], 'neutral'),
  functionEntry('t-y', 'y', ['y'], 'existential'),
  functionEntry('t-le', 'le', ['le'], 'object'),
  functionEntry('t-ne', 'ne', ['ne'], 'negation'),
  functionEntry('t-pas', 'pas', ['pas'], 'negation'),
  functionEntry('t-ici', 'ici', ['ici'], 'place'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  functionEntry('t-une', 'un', ['une'], 'article'),
  functionEntry('t-du', 'du', ['du'], 'article'),
  verbEntry('t-avoir', 'avoir', ['ai', 'a']),
  verbEntry('t-etre', 'être', ['est']),
  verbEntry('t-manger', 'manger', ['mange']),
  verbEntry('t-voir', 'voir', ['vois']),
  nounEntry('t-cahier', 'cahier', 'masculine'),
  nounEntry('t-livre', 'livre', 'masculine'),
  nounEntry('t-pain', 'pain', 'masculine'),
  nounEntry('t-table', 'table', 'feminine'),
  nounEntry('t-etudiant', 'étudiant', 'masculine'),
  nounEntry('t-frere', 'frère', 'masculine'),
  functionEntry('t-mon', 'mon', ['mon'], 'possessive'),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

/** `null` pins a skip; a string pins the answer the rule must build. */
const CASES: { sentence: Sentence; negation?: string | null; number?: string | null }[] = [
  // A negation already in the sentence is not applied twice, with or without the elided `n’`.
  { sentence: sentence('n1', 'Je ne mange pas.', [['t-je'], ['t-ne'], ['t-manger'], ['t-pas']]), negation: null },
  {
    sentence: sentence('n2', 'Il n’est pas ici.', [['t-il'], ['t-ne', 't-etre'], ['t-pas'], ['t-ici']]),
    negation: null,
  },
  // An object pronoun sits between the subject and the verb: `ne` would have to go before it.
  { sentence: sentence('n3', 'Je le vois.', [['t-je'], ['t-le'], ['t-voir']]), negation: null },
  // A subject clitic and the existential `y` stay where they are, so those sentences still negate.
  {
    sentence: sentence('n4', 'Je mange du pain.', [['t-je'], ['t-manger'], ['t-du'], ['t-pain']]),
    negation: 'Je ne mange pas de pain.',
  },
  {
    sentence: sentence('n5', 'Il y a un livre.', [['t-il'], ['t-y'], ['t-avoir'], ['t-un'], ['t-livre']]),
    negation: 'Il n’y a pas de livre.',
  },
  // Every être sentence is skipped for `number`: the phrase after it must agree with the subject.
  {
    sentence: sentence('b1', 'Mon frère est un étudiant.', [
      ['t-mon'],
      ['t-frere'],
      ['t-etre'],
      ['t-un'],
      ['t-etudiant'],
    ]),
    number: null,
  },
  { sentence: sentence('b2', 'C’est une table.', [['t-ce', 't-etre'], ['t-une'], ['t-table']]), number: null },
  // Avoir still changes its noun phrase.
  {
    sentence: sentence('b3', 'J’ai un cahier.', [['t-je', 't-avoir'], ['t-un'], ['t-cahier']]),
    negation: 'Je n’ai pas de cahier.',
    number: 'J’ai des cahiers.',
  },
];

/** The case with this sentence id, so a test names what it pins instead of counting rows. */
const caseOf = (id: string) => {
  const found = CASES.find(({ sentence: one }) => one.id === id);
  if (!found) throw new Error(`No case ${id}`);
  return found;
};

test('a sentence already negated, with ne or with an elided n’, is skipped', () => {
  for (const id of ['n1', 'n2']) {
    expect(caseOf(id).negation).toBeNull();
    expect(TRANSFORMERS.negation(caseOf(id).sentence, glossary)).toBeNull();
  }
});

test('an object clitic before the verb is skipped while subject and existential clitics still negate', () => {
  expect(TRANSFORMERS.negation(caseOf('n3').sentence, glossary)).toBeNull();
  for (const id of ['n4', 'n5'])
    expect(TRANSFORMERS.negation(caseOf(id).sentence, glossary)).toEqual({ answer: caseOf(id).negation! });
});

test('number skips every être sentence, with a noun after it or with c’est', () => {
  for (const id of ['b1', 'b2']) expect(TRANSFORMERS.number(caseOf(id).sentence, glossary)).toBeNull();
});

test('number still changes the noun phrase after avoir', () => {
  const { sentence: one, negation, number } = caseOf('b3');
  expect(TRANSFORMERS.number(one, glossary)).toEqual({ answer: number! });
  expect(TRANSFORMERS.negation(one, glossary)).toEqual({ answer: negation! });
});
