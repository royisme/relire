/**
 * `question`: the est-ce que rewrite pinned against hand-written French.
 * The bundled rows come from `starter.json`; the guard and elision rows use hand-built TEST content,
 * like `readerTransformGuards.test.ts`.
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

const readers = starterJson.readers.map((reader) => PublishedReaderSchema.parse(reader));
const bundledSentences = readers.flatMap((reader) => reader.body.sentences.map((sentence) => ({ reader, sentence })));

/** Hand-written from French grammar, never computed with the code under test; two readers repeat `J’ai un cahier.` */
const QUESTIONS: Record<string, string> = {
  'C’est une table.': 'Est-ce que c’est une table ?',
  'J’ai un cahier.': 'Est-ce que j’ai un cahier ?',
  'J’ai un stylo.': 'Est-ce que j’ai un stylo ?',
  'Ma mère aime les cahiers.': 'Est-ce que ma mère aime les cahiers ?',
  'Mes frères ont des stylos.': 'Est-ce que mes frères ont des stylos ?',
  'Il y a un salon dans cet appartement.': 'Est-ce qu’il y a un salon dans cet appartement ?',
  'Ce salon est beau.': 'Est-ce que ce salon est beau ?',
  'Il y a une chambre avec un lit.': 'Est-ce qu’il y a une chambre avec un lit ?',
  'Cette petite chambre est belle.': 'Est-ce que cette petite chambre est belle ?',
  'Ma mère regarde le salon avec moi.': 'Est-ce que ma mère regarde le salon avec moi ?',
};

test('question turns all 11 bundled sentences into est-ce que questions', () => {
  expect(bundledSentences).toHaveLength(11);
  expect(new Set(Object.keys(QUESTIONS))).toEqual(new Set(bundledSentences.map(({ sentence }) => sentence.fr)));
  for (const { reader, sentence } of bundledSentences)
    expect(TRANSFORMERS.question(sentence, reader.body.glossary)).toEqual({ answer: QUESTIONS[sentence.fr] });
});

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
const properEntry = (id: string, lemma: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'proper',
    sense: 'person',
    forms: [lemma],
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });

const glossary: ReaderGlossaryEntry[] = [
  functionEntry('t-elle', 'elle', ['elle'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-ils', 'ils', ['ils'], 'subject'),
  functionEntry('t-on', 'on', ['on'], 'subject'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  ReaderGlossaryEntrySchema.parse({
    id: 't-hier',
    lemma: 'hier',
    pos: 'adverb',
    sense: 'time',
    forms: ['hier'],
    gloss: { en: gloss('hier'), zh: '测试：hier' },
  }),
  ReaderGlossaryEntrySchema.parse({
    id: 't-bonjour',
    lemma: 'bonjour',
    pos: 'interjection',
    sense: 'greeting',
    forms: ['bonjour'],
    gloss: { en: gloss('bonjour'), zh: '测试：bonjour' },
  }),
  verbEntry('t-chanter', 'chanter', ['chante', 'chantent']),
  verbEntry('t-dormir', 'dormir', ['dort']),
  nounEntry('t-chat', 'chat', 'masculine'),
  nounEntry('t-madame', 'madame', 'feminine'),
  properEntry('t-marie', 'Marie'),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

const question = (one: Sentence) => TRANSFORMERS.question(one, glossary);

test('a sentence that is already a question or an exclamation is skipped', () => {
  expect(question(sentence('x1', 'Il chante ?', [['t-il'], ['t-chanter']]))).toBeNull();
  expect(question(sentence('x2', 'Il chante !', [['t-il'], ['t-chanter']]))).toBeNull();
});

test('a verbless line is not a statement est-ce que can turn into a question', () => {
  expect(question(sentence('x5', 'Bonjour, madame.', [['t-bonjour'], ['t-madame']]))).toBeNull();
});

test('a sentence starting with a glossary proper noun keeps its capital and takes que', () => {
  expect(question(sentence('p1', 'Marie chante.', [['t-marie'], ['t-chanter']]))).toEqual({
    answer: 'Est-ce que Marie chante ?',
  });
});

test('a first word starting with a vowel sound or a mute h takes qu’', () => {
  const cases: { sentence: Sentence; answer: string }[] = [
    { sentence: sentence('e1', 'Elle chante.', [['t-elle'], ['t-chanter']]), answer: 'Est-ce qu’elle chante ?' },
    { sentence: sentence('e2', 'On chante.', [['t-on'], ['t-chanter']]), answer: 'Est-ce qu’on chante ?' },
    { sentence: sentence('e3', 'Ils chantent.', [['t-ils'], ['t-chanter']]), answer: 'Est-ce qu’ils chantent ?' },
    {
      sentence: sentence('e4', 'Un chat dort.', [['t-un'], ['t-chat'], ['t-dormir']]),
      answer: 'Est-ce qu’un chat dort ?',
    },
    {
      sentence: sentence('e5', 'Hier, elle chante.', [['t-hier'], ['t-elle'], ['t-chanter']]),
      answer: 'Est-ce qu’hier, elle chante ?',
    },
  ];
  for (const { sentence: one, answer } of cases) expect(question(one)).toEqual({ answer });
});

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const a103 = PublishedReaderSchema.parse(starterJson.readers[2]);

test('the built unit grades the answer typed without the final ? and rejects a missing hyphen', () => {
  let id = 0;
  const [unit] = prepareReaderTransform({
    reader: a103,
    kind: 'question',
    t: i18n.getFixedT('en'),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
  expect(unit.items).toHaveLength(5);
  expect(unit.grammarTags).toEqual(['questions']);
  const [item] = unit.items;
  expect(item.expectedAnswer).toBe('Est-ce qu’il y a un salon dans cet appartement ?');
  const answer = (singleAnswer: string) => ({ ...emptyAnswer(item), singleAnswer });
  const grade = (singleAnswer: string) => gradeItem('WORD_TRANSFORM', item, answer(singleAnswer), DEFAULT_GRADING);
  const typed = 'Est-ce qu’il y a un salon dans cet appartement';
  expect(grade(typed)).toEqual({ status: 'graded', correct: true, recordedAnswer: typed });
  const noHyphen = 'Est ce qu’il y a un salon dans cet appartement ?';
  expect(grade(noHyphen)).toEqual({ status: 'graded', correct: false, recordedAnswer: noHyphen });
});
