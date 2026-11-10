/** Hand-written French and hand-built TEST glossaries for direct objects versus prepositional complements. */
import { expect, test } from 'bun:test';
import { TRANSFORMERS } from '../src/services/exercises/transform';
import { firstNounAfter, verbOf } from '../src/services/exercises/transform/words';
import {
  ReaderGlossaryEntrySchema,
  SentenceSchema,
  type ReaderGlossaryEntry,
  type Sentence,
} from '../src/types/gradedReader';

const functionEntry = (id: string, lemma: string, forms: string[], sense: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'function',
    sense,
    forms,
    gloss: { en: `TEST: ${lemma}`, zh: `测试：${lemma}` },
  });
const nounEntry = (
  id: string,
  lemma: string,
  gender: 'masculine' | 'feminine',
  forms: string[] = [lemma],
): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'noun',
    sense: 'thing',
    forms,
    gender,
    gloss: { en: `TEST: ${lemma}`, zh: `测试：${lemma}` },
  });
const verbEntry = (id: string, lemma: string, forms: string[]): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'verb',
    sense: 'action',
    forms,
    gloss: { en: `TEST: ${lemma}`, zh: `测试：${lemma}` },
  });

const glossary: ReaderGlossaryEntry[] = [
  functionEntry('t-je', 'je', ['je', 'j’ai'], 'subject'),
  functionEntry('t-elle', 'elle', ['elle'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-y', 'y', ['y'], 'existential'),
  functionEntry('t-a', 'à', ['à'], 'preposition'),
  functionEntry('t-dans', 'dans', ['dans'], 'preposition'),
  functionEntry('t-avec', 'avec', ['avec'], 'preposition'),
  functionEntry('t-de', 'de', ['de'], 'preposition'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  functionEntry('t-une', 'une', ['une'], 'article'),
  functionEntry('t-le', 'le', ['le', 'l’eau'], 'article'),
  functionEntry('t-la', 'la', ['la'], 'article'),
  // Contracted articles must be rejected even without a separately bound preposition à.
  functionEntry('t-au', 'au', ['au'], 'article'),
  functionEntry('t-aux', 'aux', ['aux'], 'article'),
  functionEntry('t-du', 'du', ['du'], 'article'),
  functionEntry('t-cet', 'ce', ['cet'], 'demonstrative'),
  verbEntry('t-aller', 'aller', ['vais']),
  verbEntry('t-parler', 'parler', ['parle']),
  verbEntry('t-habiter', 'habiter', ['habite']),
  verbEntry('t-travailler', 'travailler', ['travaille']),
  verbEntry('t-avoir', 'avoir', ['ai', 'a']),
  verbEntry('t-manger', 'manger', ['mange']),
  verbEntry('t-boire', 'boire', ['boit']),
  nounEntry('t-fete', 'fête', 'feminine'),
  nounEntry('t-plage', 'plage', 'feminine'),
  nounEntry('t-cinema', 'cinéma', 'masculine'),
  nounEntry('t-voisin', 'voisin', 'masculine', ['voisin', 'voisins']),
  nounEntry('t-maison', 'maison', 'feminine'),
  nounEntry('t-ami', 'ami', 'masculine'),
  nounEntry('t-cahier', 'cahier', 'masculine'),
  nounEntry('t-pomme', 'pomme', 'feminine'),
  nounEntry('t-jardin', 'jardin', 'masculine'),
  nounEntry('t-pain', 'pain', 'masculine'),
  nounEntry('t-eau', 'eau', 'feminine', ['eau', 'l’eau']),
  nounEntry('t-soupe', 'soupe', 'feminine'),
  nounEntry('t-salon', 'salon', 'masculine'),
  nounEntry('t-appartement', 'appartement', 'masculine'),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

/** Every case pins all three kinds; null means an intentional skip, never an omitted assertion. */
const CASES: {
  sentence: Sentence;
  noun: string | null;
  negation: string;
  pronoun: string | null;
  number: string | null;
}[] = [
  {
    sentence: sentence('a-une', 'Je vais à une fête.', [['t-je'], ['t-aller'], ['t-a'], ['t-une'], ['t-fete']]),
    noun: null,
    negation: 'Je ne vais pas à une fête.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('a-la', 'Je vais à la plage.', [['t-je'], ['t-aller'], ['t-a'], ['t-la'], ['t-plage']]),
    noun: null,
    negation: 'Je ne vais pas à la plage.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('au', 'Je vais au cinéma.', [['t-je'], ['t-aller'], ['t-au'], ['t-cinema']]),
    noun: null,
    negation: 'Je ne vais pas au cinéma.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('aux', 'Je parle aux voisins.', [['t-je'], ['t-parler'], ['t-aux'], ['t-voisin']]),
    noun: null,
    negation: 'Je ne parle pas aux voisins.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('dans', 'Elle habite dans une maison.', [
      ['t-elle'],
      ['t-habiter'],
      ['t-dans'],
      ['t-une'],
      ['t-maison'],
    ]),
    noun: null,
    negation: 'Elle n’habite pas dans une maison.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('avec', 'Il travaille avec un ami.', [
      ['t-il'],
      ['t-travailler'],
      ['t-avec'],
      ['t-un'],
      ['t-ami'],
    ]),
    noun: null,
    negation: 'Il ne travaille pas avec un ami.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('direct', 'J’ai un cahier.', [['t-je', 't-avoir'], ['t-un'], ['t-cahier']]),
    noun: 'cahier',
    negation: 'Je n’ai pas de cahier.',
    pronoun: null,
    number: 'J’ai des cahiers.',
  },
  {
    sentence: sentence('direct-before-dans', 'Elle mange une pomme dans le jardin.', [
      ['t-elle'],
      ['t-manger'],
      ['t-une'],
      ['t-pomme'],
      ['t-dans'],
      ['t-le'],
      ['t-jardin'],
    ]),
    noun: 'pomme',
    negation: 'Elle ne mange pas de pomme dans le jardin.',
    // Already null on main: pronoun only replaces definite articles, not une.
    pronoun: null,
    number: 'Elle mange des pommes dans le jardin.',
  },
  {
    sentence: sentence('definite-before-dans', 'Elle mange la pomme dans le jardin.', [
      ['t-elle'],
      ['t-manger'],
      ['t-la'],
      ['t-pomme'],
      ['t-dans'],
      ['t-le'],
      ['t-jardin'],
    ]),
    noun: 'pomme',
    negation: 'Elle ne mange pas la pomme dans le jardin.',
    pronoun: 'Elle la mange dans le jardin.',
    number: 'Elle mange les pommes dans le jardin.',
  },
  {
    sentence: sentence('partitive-du', 'Je mange du pain.', [['t-je'], ['t-manger'], ['t-du'], ['t-pain']]),
    noun: 'pain',
    negation: 'Je ne mange pas de pain.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('partitive-de-l', 'Elle boit de l’eau.', [['t-elle'], ['t-boire'], ['t-de'], ['t-le', 't-eau']]),
    noun: 'eau',
    negation: 'Elle ne boit pas d’eau.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('partitive-de-la', 'Je mange de la soupe.', [
      ['t-je'],
      ['t-manger'],
      ['t-de'],
      ['t-la'],
      ['t-soupe'],
    ]),
    noun: 'soupe',
    negation: 'Je ne mange pas de soupe.',
    pronoun: null,
    number: null,
  },
  {
    sentence: sentence('existential-before-dans', 'Il y a un salon dans cet appartement.', [
      ['t-il'],
      ['t-y'],
      ['t-avoir'],
      ['t-un'],
      ['t-salon'],
      ['t-dans'],
      ['t-cet'],
      ['t-appartement'],
    ]),
    noun: 'salon',
    negation: 'Il n’y a pas de salon dans cet appartement.',
    pronoun: null,
    number: 'Il y a des salons dans cet appartement.',
  },
];

for (const one of CASES) {
  // au/aux already fail downstream article guards; pin the noun lookup itself as well.
  test(`object noun: ${one.sentence.fr}`, () => {
    const verb = verbOf(one.sentence, glossary);
    if (!verb) throw new Error(`Missing finite verb: ${one.sentence.fr}`);
    const noun = firstNounAfter(one.sentence, glossary, verb.words, verb.index);
    if (one.noun === null) expect(noun).toBeUndefined();
    if (one.noun !== null) expect(noun?.entry.lemma).toBe(one.noun);
  });

  for (const kind of ['negation', 'pronoun', 'number'] as const) {
    test(`${kind}: ${one.sentence.fr}`, () => {
      expect(TRANSFORMERS[kind](one.sentence, glossary)).toEqual(one[kind] === null ? null : { answer: one[kind] });
    });
  }
}
