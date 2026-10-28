/**
 * `pronoun`: the definite object after the verb replaced with le, la, l’ or les, pinned against hand-written
 * French. Every row uses hand-built TEST content, like `readerTransformQuestion.test.ts`; TEST entries only.
 */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import starterJson from '../src/data/graded-readers/starter.json';
import { emptyAnswer } from '../src/services/exercises/answer';
import { prepareReaderTransform } from '../src/services/exercises/fromReaderTransform';
import { DEFAULT_GRADING, gradeItem } from '../src/services/exercises/grading';
import { TRANSFORMERS } from '../src/services/exercises/transform';
import {
  PublishedReaderSchema,
  ReaderGlossaryEntrySchema,
  SentenceSchema,
  type ReaderGlossaryEntry,
  type Sentence,
} from '../src/types/gradedReader';
import en from '../src/i18n/locales/en.json';
import zh from '../src/i18n/locales/zh.json';

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
const adjectiveEntry = (id: string, lemma: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'adjective',
    sense: 'size',
    forms: [lemma],
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });
const adverbEntry = (id: string, lemma: string, sense: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'adverb',
    sense,
    forms: [lemma],
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });

const glossary: ReaderGlossaryEntry[] = [
  functionEntry('t-je', 'je', ['je'], 'subject'),
  functionEntry('t-elle', 'elle', ['elle'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-ce', 'ce', ['ce'], 'neutral'),
  // `y` is an adverb here, so the `il y a` guard, not the clitic guard, is what skips the existential row.
  adverbEntry('t-y', 'y', 'existential'),
  functionEntry('t-le', 'le', ['le'], 'article'),
  functionEntry('t-la', 'la', ['la'], 'article'),
  functionEntry('t-les', 'les', ['les'], 'article'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  functionEntry('t-de', 'de', ['de'], 'article'),
  functionEntry('t-a', 'à', ['à'], 'preposition'),
  functionEntry('t-avec', 'avec', ['avec'], 'preposition'),
  functionEntry('t-ma', 'ma', ['ma'], 'possessive'),
  functionEntry('t-me', 'me', ['me'], 'object'),
  functionEntry('t-moi', 'moi', ['moi'], 'object'),
  verbEntry('t-avoir', 'avoir', ['ai', 'a']),
  verbEntry('t-etre', 'être', ['est']),
  verbEntry('t-aimer', 'aimer', ['aime']),
  verbEntry('t-regarder', 'regarder', ['regarde']),
  verbEntry('t-manger', 'manger', ['mange']),
  verbEntry('t-parler', 'parler', ['parle']),
  nounEntry('t-mere', 'mère', 'feminine'),
  nounEntry('t-cahier', 'cahier', 'masculine'),
  nounEntry('t-salon', 'salon', 'masculine'),
  nounEntry('t-table', 'table', 'feminine'),
  nounEntry('t-ecole', 'école', 'feminine'),
  nounEntry('t-soupe', 'soupe', 'feminine'),
  nounEntry('t-chat', 'chat', 'masculine'),
  adjectiveEntry('t-petit', 'petit'),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

const pronoun = (one: Sentence) => TRANSFORMERS.pronoun(one, glossary);

const ANSWERS: { sentence: Sentence; answer: string }[] = [
  {
    sentence: sentence('a1', 'Ma mère aime les cahiers.', [['t-ma'], ['t-mere'], ['t-aimer'], ['t-les'], ['t-cahier']]),
    answer: 'Ma mère les aime.',
  },
  {
    sentence: sentence('a2', 'Ma mère regarde le salon avec moi.', [
      ['t-ma'],
      ['t-mere'],
      ['t-regarder'],
      ['t-le'],
      ['t-salon'],
      ['t-avec'],
      ['t-moi'],
    ]),
    answer: 'Ma mère le regarde avec moi.',
  },
  {
    sentence: sentence('a3', 'J’ai le cahier.', [['t-je', 't-avoir'], ['t-le'], ['t-cahier']]),
    answer: 'Je l’ai.',
  },
  {
    sentence: sentence('a4', 'J’ai la table.', [['t-je', 't-avoir'], ['t-la'], ['t-table']]),
    answer: 'Je l’ai.',
  },
  {
    sentence: sentence('a5', 'Elle regarde la table.', [['t-elle'], ['t-regarder'], ['t-la'], ['t-table']]),
    answer: 'Elle la regarde.',
  },
  {
    sentence: sentence('a6', 'Elle aime l’école.', [['t-elle'], ['t-aimer'], ['t-ecole']]),
    answer: 'Elle l’aime.',
  },
  {
    sentence: sentence('a7', 'Elle aime les écoles.', [['t-elle'], ['t-aimer'], ['t-les'], ['t-ecole']]),
    answer: 'Elle les aime.',
  },
];

test('a definite object after the verb becomes le, la, l’ or les before the verb', () => {
  for (const { sentence: one, answer } of ANSWERS) expect(pronoun(one)).toEqual({ answer });
});

test('être has no object to replace', () => {
  // The elided `c’` is restorable, so only the être guard can skip this row.
  const one = sentence('s1', 'C’est le salon.', [['t-ce', 't-etre'], ['t-le'], ['t-salon']]);
  expect(pronoun(one)).toBeNull();
});

test('il y a has no object to replace', () => {
  const one = sentence('s2', 'Il y a le salon.', [['t-il'], ['t-y'], ['t-avoir'], ['t-le'], ['t-salon']]);
  expect(pronoun(one)).toBeNull();
});

test('an indefinite, partitive or possessive object is not this replacement', () => {
  const cases: Sentence[] = [
    sentence('s3', 'J’ai un cahier.', [['t-je', 't-avoir'], ['t-un'], ['t-cahier']]),
    sentence('s4', 'Elle mange de la soupe.', [['t-elle'], ['t-manger'], ['t-de'], ['t-la'], ['t-soupe']]),
    sentence('s5', 'Elle aime ma table.', [['t-elle'], ['t-aimer'], ['t-ma'], ['t-table']]),
  ];
  for (const one of cases) expect(pronoun(one)).toBeNull();
});

test('the phrase must follow the verb directly and start with the article, so a preposition or an adjective skips', () => {
  const cases: Sentence[] = [
    sentence('s6', 'Elle parle à la mère.', [['t-elle'], ['t-parler'], ['t-a'], ['t-la'], ['t-mere']]),
    sentence('s7', 'Elle regarde le petit chat.', [['t-elle'], ['t-regarder'], ['t-le'], ['t-petit'], ['t-chat']]),
  ];
  for (const one of cases) expect(pronoun(one)).toBeNull();
});

test('an object pronoun already before the verb is skipped, and so is an article disagreeing with its noun', () => {
  const cases: Sentence[] = [
    sentence('s8', 'Elle me regarde.', [['t-elle'], ['t-me'], ['t-regarder']]),
    sentence('s9', 'Elle aime le table.', [['t-elle'], ['t-aimer'], ['t-le'], ['t-table']]),
  ];
  for (const one of cases) expect(pronoun(one)).toBeNull();
});

test('an elided subject the glossary cannot restore is skipped', () => {
  const missingClitic = sentence('s10', 'J’ai le cahier.', [['t-avoir'], ['t-le'], ['t-cahier']]);
  expect(pronoun(missingClitic)).toBeNull();
});

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const a103 = PublishedReaderSchema.parse(starterJson.readers[2]);

test('the built unit grades the answer typed without the final full stop', () => {
  let id = 0;
  const [unit] = prepareReaderTransform({
    reader: a103,
    kind: 'pronoun',
    t: i18n.getFixedT('en'),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
  expect(unit.items).toHaveLength(1);
  expect(unit.grammarTags).toEqual(['subject-object-pronouns']);
  const [item] = unit.items;
  expect(item.expectedAnswer).toBe('Ma mère le regarde avec moi.');
  const answer = (singleAnswer: string) => ({ ...emptyAnswer(item), singleAnswer });
  const grade = (singleAnswer: string) => gradeItem('WORD_TRANSFORM', item, answer(singleAnswer), DEFAULT_GRADING);
  const typed = 'Ma mère le regarde avec moi';
  expect(grade(typed)).toEqual({ status: 'graded', correct: true, recordedAnswer: typed });
});
