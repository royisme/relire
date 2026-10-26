/** The pure transformation kinds pinned against hand-written French: the 11 bundled sentences plus synthetic schema-bound cases. */
import { expect, test } from 'bun:test';
import starterJson from '../src/data/graded-readers/starter.json';
import { TRANSFORMERS, coveredKinds } from '../src/services/exercises/transform';
import {
  ReaderGlossaryEntrySchema,
  PublishedReaderSchema,
  SentenceSchema,
  type ReaderGlossaryEntry,
  type Sentence,
} from '../src/types/gradedReader';
import { READER_TRANSFORM_KINDS } from '../src/types/readerTransform';

const readers = starterJson.readers.map((reader) => PublishedReaderSchema.parse(reader));
const bundledSentences = readers.flatMap((reader) => reader.body.sentences.map((sentence) => ({ reader, sentence })));

/** Hand-written from French grammar, never computed with the code under test. */
const NEGATION: Record<string, string> = {
  'C’est une table.': 'Ce n’est pas une table.',
  'J’ai un cahier.': 'Je n’ai pas de cahier.',
  'J’ai un stylo.': 'Je n’ai pas de stylo.',
  'Ma mère aime les cahiers.': 'Ma mère n’aime pas les cahiers.',
  'Mes frères ont des stylos.': 'Mes frères n’ont pas de stylos.',
  'Il y a un salon dans cet appartement.': 'Il n’y a pas de salon dans cet appartement.',
  'Ce salon est beau.': 'Ce salon n’est pas beau.',
  'Il y a une chambre avec un lit.': 'Il n’y a pas de chambre avec un lit.',
  'Cette petite chambre est belle.': 'Cette petite chambre n’est pas belle.',
  'Ma mère regarde le salon avec moi.': 'Ma mère ne regarde pas le salon avec moi.',
};
const NUMBER: Record<string, string> = {
  'J’ai un cahier.': 'J’ai des cahiers.',
  'J’ai un stylo.': 'J’ai des stylos.',
  'Ma mère aime les cahiers.': 'Ma mère aime le cahier.',
  'Mes frères ont des stylos.': 'Mes frères ont un stylo.',
  'Il y a un salon dans cet appartement.': 'Il y a des salons dans cet appartement.',
  'Il y a une chambre avec un lit.': 'Il y a des chambres avec un lit.',
  'Ma mère regarde le salon avec moi.': 'Ma mère regarde les salons avec moi.',
};
const NUMBER_SKIPPED = ['C’est une table.', 'Ce salon est beau.', 'Cette petite chambre est belle.'];

test('negation covers every bundled sentence with ne … pas and the article rule', () => {
  expect(bundledSentences).toHaveLength(11);
  expect(new Set(Object.keys(NEGATION))).toEqual(new Set(bundledSentences.map(({ sentence }) => sentence.fr)));
  for (const { reader, sentence } of bundledSentences)
    expect(TRANSFORMERS.negation(sentence, reader.body.glossary)).toEqual({
      answer: NEGATION[sentence.fr],
    });
});

test('number covers the seven noun-phrase sentences and skips subject and c’est sentences', () => {
  expect(new Set([...Object.keys(NUMBER), ...NUMBER_SKIPPED])).toEqual(
    new Set(bundledSentences.map(({ sentence }) => sentence.fr)),
  );
  for (const { reader, sentence } of bundledSentences) {
    const transformed = TRANSFORMERS.number(sentence, reader.body.glossary);
    if (NUMBER_SKIPPED.includes(sentence.fr)) expect(transformed).toBeNull();
    else expect(transformed).toEqual({ answer: NUMBER[sentence.fr] });
  }
});

test('every bundled reader offers both kinds', () => {
  for (const reader of readers) expect(coveredKinds(reader)).toEqual(READER_TRANSFORM_KINDS);
});

// Invented TEST entries and sentences only; the schema needs every word bound to local glossary entries.
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

const syntheticGlossary: ReaderGlossaryEntry[] = [
  functionEntry('t-je', 'je', ['j’ai'], 'subject'),
  functionEntry('t-elle', 'elle', ['elle'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-y', 'y', ['y'], 'existential'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  functionEntry('t-des', 'des', ['des'], 'article'),
  functionEntry('t-le', 'le', ['le'], 'article'),
  functionEntry('t-et', 'et', ['et'], 'conjunction'),
  verbEntry('t-avoir', 'avoir', ['ai', 'as', 'a', 'avons', 'avez', 'ont']),
  verbEntry('t-aimer', 'aimer', ['aime']),
  verbEntry('t-chanter', 'chanter', ['chante']),
  verbEntry('t-danser', 'danser', ['danse']),
  nounEntry('t-ami', 'ami', 'masculine'),
  nounEntry('t-ecole', 'école', 'feminine'),
  nounEntry('t-chambre', 'chambre', 'feminine'),
  nounEntry('t-livre', 'livre', 'masculine'),
  nounEntry('t-bras', 'bras', 'masculine'),
  nounEntry('t-prix', 'prix', 'masculine'),
  nounEntry('t-nez', 'nez', 'masculine'),
  nounEntry('t-cheval', 'cheval', 'masculine'),
  nounEntry('t-travail', 'travail', 'masculine'),
  nounEntry('t-bateau', 'bateau', 'masculine'),
  nounEntry('t-feu', 'feu', 'masculine'),
  ReaderGlossaryEntrySchema.parse({
    id: 't-rouge',
    lemma: 'rouge',
    pos: 'adjective',
    sense: 'color',
    forms: ['rouge'],
    gloss: { en: gloss('rouge'), zh: '测试：红色' },
  }),
  ReaderGlossaryEntrySchema.parse({
    id: 't-marie',
    lemma: 'Marie',
    pos: 'proper',
    sense: 'person',
    forms: ['Marie'],
    gloss: { en: gloss('Marie'), zh: '测试：玛丽' },
  }),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

/** Rows assert only the kinds named; `null` pins a skip, a missing kind is not asserted. */
const CASES: { sentence: Sentence; negation?: string | null; number?: string | null }[] = [
  {
    sentence: sentence('a1', 'J’ai un ami.', [['t-je', 't-avoir'], ['t-un'], ['t-ami']]),
    negation: 'Je n’ai pas d’ami.',
    number: 'J’ai des amis.',
  },
  {
    sentence: sentence('a2', 'Elle a des amis.', [['t-elle'], ['t-avoir'], ['t-des'], ['t-ami']]),
    number: 'Elle a un ami.',
  },
  {
    sentence: sentence('a3', 'Elle aime l’école.', [['t-elle'], ['t-aimer'], ['t-ecole']]),
    negation: 'Elle n’aime pas l’école.',
    number: 'Elle aime les écoles.',
  },
  {
    sentence: sentence('a4', 'Il y a des chambres.', [['t-il'], ['t-y'], ['t-avoir'], ['t-des'], ['t-chambre']]),
    number: 'Il y a une chambre.',
  },
  { sentence: sentence('e1', 'J’ai un bras.', [['t-je', 't-avoir'], ['t-un'], ['t-bras']]), number: null },
  { sentence: sentence('e2', 'J’ai un prix.', [['t-je', 't-avoir'], ['t-un'], ['t-prix']]), number: null },
  { sentence: sentence('e3', 'J’ai un nez.', [['t-je', 't-avoir'], ['t-un'], ['t-nez']]), number: null },
  { sentence: sentence('e4', 'J’ai un cheval.', [['t-je', 't-avoir'], ['t-un'], ['t-cheval']]), number: null },
  { sentence: sentence('e5', 'J’ai un travail.', [['t-je', 't-avoir'], ['t-un'], ['t-travail']]), number: null },
  { sentence: sentence('e6', 'J’ai un bateau.', [['t-je', 't-avoir'], ['t-un'], ['t-bateau']]), number: null },
  { sentence: sentence('e7', 'J’ai un feu.', [['t-je', 't-avoir'], ['t-un'], ['t-feu']]), number: null },
  {
    sentence: sentence('v1', 'Le livre rouge.', [['t-le'], ['t-livre'], ['t-rouge']]),
    negation: null,
    number: null,
  },
  {
    sentence: sentence('v2', 'Marie chante et danse.', [['t-marie'], ['t-chanter'], ['t-et'], ['t-danser']]),
    negation: null,
    number: null,
  },
];

for (const kind of READER_TRANSFORM_KINDS) {
  test(`synthetic sentences pin the ${kind} rule`, () => {
    for (const { sentence: one, ...expected } of CASES) {
      const wanted = expected[kind];
      if (wanted === undefined) continue;
      const transformed = TRANSFORMERS[kind](one, syntheticGlossary);
      if (wanted === null) expect(transformed).toBeNull();
      else expect(transformed).toEqual({ answer: wanted });
    }
  });
}
