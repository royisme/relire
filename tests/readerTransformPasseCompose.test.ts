/**
 * `passe-compose`: the sentence's present verb put into the passé composé with avoir, pinned against
 * hand-written French. The bundled rows come from `starter.json`; the guard and synthetic rows use hand-built
 * TEST content, like `readerTransformPronoun.test.ts`. No expected answer is computed by test code.
 */
import { expect, test } from 'bun:test';
import i18next from 'i18next';
import starterJson from '../src/data/graded-readers/starter.json';
import { emptyAnswer } from '../src/services/exercises/answer';
import { prepareReaderTransform } from '../src/services/exercises/fromReaderTransform';
import { DEFAULT_GRADING, gradeItem } from '../src/services/exercises/grading';
import { TRANSFORMERS, coveredKinds } from '../src/services/exercises/transform';
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

/**
 * Hand-written from French grammar: a present regular -er verb, `avoir` or `être` takes avoir and the past
 * participle `-é`, `eu` or `été`. `C’est une table.` is the one bundled sentence the rule skips.
 */
const BUNDLED: Record<string, string | null> = {
  'C’est une table.': null,
  'J’ai un cahier.': 'J’ai eu un cahier.',
  'J’ai un stylo.': 'J’ai eu un stylo.',
  'Ma mère aime les cahiers.': 'Ma mère a aimé les cahiers.',
  'Mes frères ont des stylos.': 'Mes frères ont eu des stylos.',
  'Il y a un salon dans cet appartement.': 'Il y a eu un salon dans cet appartement.',
  'Ce salon est beau.': 'Ce salon a été beau.',
  'Il y a une chambre avec un lit.': 'Il y a eu une chambre avec un lit.',
  'Cette petite chambre est belle.': 'Cette petite chambre a été belle.',
  'Ma mère regarde le salon avec moi.': 'Ma mère a regardé le salon avec moi.',
};

test('passe-compose covers every bundled sentence but c’est, and every answer is the whole sentence', () => {
  expect(bundledSentences).toHaveLength(11);
  expect(new Set(Object.keys(BUNDLED))).toEqual(new Set(bundledSentences.map(({ sentence }) => sentence.fr)));
  for (const { reader, sentence } of bundledSentences) {
    const wanted = BUNDLED[sentence.fr];
    const transformed = TRANSFORMERS['passe-compose'](sentence, reader.body.glossary);
    if (wanted === null) expect(transformed).toBeNull();
    else expect(transformed).toEqual({ answer: wanted });
  }
});

test('every bundled reader covers passe-compose, so the button shows on all three', () => {
  expect(readers.map((reader) => reader.body.id)).toEqual(['a1-01', 'a1-02', 'a1-03']);
  for (const reader of readers) expect(coveredKinds(reader)).toContain('passe-compose');
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
const adjectiveEntry = (id: string, lemma: string, sense: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'adjective',
    sense,
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
const properEntry = (id: string, lemma: string): ReaderGlossaryEntry =>
  ReaderGlossaryEntrySchema.parse({
    id,
    lemma,
    pos: 'proper',
    sense: 'name',
    forms: [lemma],
    gloss: { en: gloss(lemma), zh: `测试：${lemma}` },
  });

/** The seventeen verbs the plan excludes: their participle is built on être, so no avoir answer exists. */
const ETRE_AUXILIARY: [id: string, lemma: string, form: string][] = [
  ['t-aller', 'aller', 'vais'],
  ['t-arriver', 'arriver', 'arrive'],
  ['t-descendre', 'descendre', 'descend'],
  ['t-devenir', 'devenir', 'devient'],
  ['t-entrer', 'entrer', 'entre'],
  ['t-monter', 'monter', 'monte'],
  ['t-mourir', 'mourir', 'meurt'],
  ['t-naitre', 'naître', 'naît'],
  ['t-partir', 'partir', 'part'],
  ['t-passer', 'passer', 'passe'],
  ['t-rentrer', 'rentrer', 'rentre'],
  ['t-rester', 'rester', 'reste'],
  ['t-retourner', 'retourner', 'retourne'],
  ['t-revenir', 'revenir', 'revient'],
  ['t-sortir', 'sortir', 'sort'],
  ['t-tomber', 'tomber', 'tombe'],
  ['t-venir', 'venir', 'vient'],
];

const glossary: ReaderGlossaryEntry[] = [
  functionEntry('t-je', 'je', ['je'], 'subject'),
  functionEntry('t-tu', 'tu', ['tu'], 'subject'),
  functionEntry('t-il', 'il', ['il'], 'subject'),
  functionEntry('t-elle', 'elle', ['elle'], 'subject'),
  functionEntry('t-ils', 'ils', ['ils'], 'subject'),
  functionEntry('t-elles', 'elles', ['elles'], 'subject'),
  functionEntry('t-nous', 'nous', ['nous'], 'subject'),
  functionEntry('t-vous', 'vous', ['vous'], 'subject'),
  functionEntry('t-ce', 'ce', ['c’'], 'neutral'),
  functionEntry('t-me', 'me', ['me'], 'object'),
  functionEntry('t-te', 'te', ['te'], 'reflexive'),
  functionEntry('t-se', 'se', ['se'], 'reflexive'),
  functionEntry('t-nous-reflexive', 'nous', ['nous'], 'reflexive'),
  functionEntry('t-vous-reflexive', 'vous', ['vous'], 'reflexive'),
  functionEntry('t-le-object', 'le', ['le'], 'object'),
  functionEntry('t-les-object', 'les', ['les'], 'object'),
  functionEntry('t-le-article', 'le', ['le'], 'article'),
  functionEntry('t-les-article', 'les', ['les'], 'article'),
  functionEntry('t-un', 'un', ['un'], 'article'),
  functionEntry('t-une', 'un', ['une'], 'article'),
  functionEntry('t-ne', 'ne', ['ne', 'n’'], 'negation'),
  functionEntry('t-pas', 'pas', ['pas'], 'negation'),
  functionEntry('t-que', 'que', ['que'], 'restriction'),
  functionEntry('t-a', 'à', ['à'], 'preposition'),
  functionEntry('t-et', 'et', ['et'], 'conjunction'),
  verbEntry('t-aimer', 'aimer', ['aime', 'aimes', 'aimons', 'aimez', 'aiment']),
  verbEntry('t-appeler', 'appeler', ['appelle', 'appelles', 'appelons', 'appelez', 'appellent']),
  verbEntry('t-chanter', 'chanter', ['chante', 'chantent']),
  verbEntry('t-danser', 'danser', ['danse', 'dansent']),
  verbEntry('t-falloir', 'falloir', ['faut']),
  verbEntry('t-finir', 'finir', ['finit']),
  verbEntry('t-laver', 'laver', ['lave']),
  verbEntry('t-se-laver', 'se laver', ['lave']),
  verbEntry('t-lever', 'lever', ['lève', 'lèves', 'levons', 'levez', 'lèvent']),
  verbEntry('t-manger', 'manger', ['mange', 'manges', 'mangeons', 'mangez', 'mangent']),
  verbEntry('t-parler', 'parler', ['parle']),
  verbEntry('t-penser', 'penser', ['pense']),
  verbEntry('t-prendre', 'prendre', ['prend']),
  verbEntry('t-regarder', 'regarder', ['regarde']),
  verbEntry('t-retomber', 'retomber', ['retombe']),
  verbEntry('t-porter', 'porter', ['porte']),
  verbEntry('t-avoir', 'avoir', ['ai', 'as', 'a', 'avons', 'avez', 'ont']),
  verbEntry('t-etre', 'être', ['suis', 'es', 'est', 'sommes', 'êtes', 'sont']),
  ...ETRE_AUXILIARY.map(([id, lemma, form]) => verbEntry(id, lemma, [form])),
  nounEntry('t-cahier', 'cahier', 'masculine'),
  nounEntry('t-chat', 'chat', 'masculine'),
  nounEntry('t-livre', 'livre', 'masculine'),
  nounEntry('t-pomme', 'pomme', 'feminine'),
  nounEntry('t-robe', 'robe', 'feminine'),
  nounEntry('t-salon', 'salon', 'masculine'),
  nounEntry('t-table', 'table', 'feminine'),
  adjectiveEntry('t-content', 'content', 'mood'),
  adjectiveEntry('t-rouge', 'rouge', 'color'),
  adverbEntry('t-la-place', 'là', 'place'),
  adverbEntry('t-y-place', 'y', 'place'),
  adverbEntry('t-voici', 'voici', 'presentation'),
  properEntry('t-marie', 'Marie'),
  properEntry('t-paris', 'Paris'),
];

const sentence = (id: string, fr: string, bindings: string[][]): Sentence =>
  SentenceSchema.parse({
    id,
    fr,
    translation: { en: `TEST: ${fr}`, zh: `测试：${fr}` },
    tokens: bindings.map((entryIds, ordinal) => ({ ordinal, entryIds })),
  });

/** Six persons on one -er verb, then avoir and être: the auxiliary agrees with the subject, not the object. */
const ANSWERS: { sentence: Sentence; answer: string }[] = [
  {
    sentence: sentence('p1', 'J’aime les cahiers.', [['t-je', 't-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'J’ai aimé les cahiers.',
  },
  {
    sentence: sentence('p2', 'Tu aimes les cahiers.', [['t-tu'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'Tu as aimé les cahiers.',
  },
  {
    sentence: sentence('p3', 'Elle aime les cahiers.', [['t-elle'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'Elle a aimé les cahiers.',
  },
  {
    sentence: sentence('p4', 'Nous aimons les cahiers.', [['t-nous'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'Nous avons aimé les cahiers.',
  },
  {
    sentence: sentence('p5', 'Vous aimez les cahiers.', [['t-vous'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'Vous avez aimé les cahiers.',
  },
  {
    sentence: sentence('p6', 'Elles aiment les cahiers.', [['t-elles'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
    answer: 'Elles ont aimé les cahiers.',
  },
  // `Je` as its own word elides with the vowel-initial auxiliary; the elided `J’` keeps its written prefix.
  {
    sentence: sentence('p7', 'Je mange une pomme.', [['t-je'], ['t-manger'], ['t-une'], ['t-pomme']]),
    answer: 'J’ai mangé une pomme.',
  },
  {
    sentence: sentence('p8', 'Il mange une pomme.', [['t-il'], ['t-manger'], ['t-une'], ['t-pomme']]),
    answer: 'Il a mangé une pomme.',
  },
  {
    sentence: sentence('p9', 'Tu as un chat.', [['t-tu'], ['t-avoir'], ['t-un'], ['t-chat']]),
    answer: 'Tu as eu un chat.',
  },
  {
    sentence: sentence('p10', 'Elle a un chat.', [['t-elle'], ['t-avoir'], ['t-un'], ['t-chat']]),
    answer: 'Elle a eu un chat.',
  },
  {
    sentence: sentence('p11', 'Ils ont un chat.', [['t-ils'], ['t-avoir'], ['t-un'], ['t-chat']]),
    answer: 'Ils ont eu un chat.',
  },
  {
    sentence: sentence('p12', 'Nous avons un chat.', [['t-nous'], ['t-avoir'], ['t-un'], ['t-chat']]),
    answer: 'Nous avons eu un chat.',
  },
  {
    sentence: sentence('p17', 'Vous avez un chat.', [['t-vous'], ['t-avoir'], ['t-un'], ['t-chat']]),
    answer: 'Vous avez eu un chat.',
  },
  {
    sentence: sentence('p18', 'Je suis content.', [['t-je'], ['t-etre'], ['t-content']]),
    answer: 'J’ai été content.',
  },
  {
    sentence: sentence('p19', 'Nous sommes là.', [['t-nous'], ['t-etre'], ['t-la-place']]),
    answer: 'Nous avons été là.',
  },
  // être takes avoir itself, unlike the seventeen verbs above.
  {
    sentence: sentence('p13', 'Il est content.', [['t-il'], ['t-etre'], ['t-content']]),
    answer: 'Il a été content.',
  },
  {
    sentence: sentence('p14', 'Elles sont là.', [['t-elles'], ['t-etre'], ['t-la-place']]),
    answer: 'Elles ont été là.',
  },
  // The complement after the verb and the final full stop stay as written.
  {
    sentence: sentence('p15', 'Elle parle à Marie.', [['t-elle'], ['t-parler'], ['t-a'], ['t-marie']]),
    answer: 'Elle a parlé à Marie.',
  },
  { sentence: sentence('p16', 'Elles dansent.', [['t-elles'], ['t-danser']]), answer: 'Elles ont dansé.' },
];

test('a present regular -er verb, avoir or être takes its avoir auxiliary and its participle', () => {
  for (const { sentence: one, answer } of ANSWERS)
    expect(TRANSFORMERS['passe-compose'](one, glossary)).toEqual({ answer });
});

const passeCompose = (one: Sentence) => TRANSFORMERS['passe-compose'](one, glossary);

test('the seventeen être-auxiliary verbs are skipped, the regular -er ones included', () => {
  // `arriver`, `monter` and `passer` are regular -er verbs, so only the auxiliary list can skip them.
  const cases: Sentence[] = [
    sentence('x01', 'Il arrive.', [['t-il'], ['t-arriver']]),
    sentence('x02', 'Elle monte.', [['t-elle'], ['t-monter']]),
    sentence('x03', 'Il passe.', [['t-il'], ['t-passer']]),
    sentence('x04', 'Elle reste.', [['t-elle'], ['t-rester']]),
    sentence('x05', 'Il tombe.', [['t-il'], ['t-tomber']]),
    sentence('x06', 'Il entre.', [['t-il'], ['t-entrer']]),
    sentence('x07', 'Il sort.', [['t-il'], ['t-sortir']]),
    sentence('x08', 'Il descend.', [['t-il'], ['t-descendre']]),
    sentence('x09', 'Il naît.', [['t-il'], ['t-naitre']]),
    sentence('x10', 'Il meurt.', [['t-il'], ['t-mourir']]),
    sentence('x11', 'Il retourne.', [['t-il'], ['t-retourner']]),
    sentence('x12', 'Il devient.', [['t-il'], ['t-devenir']]),
    sentence('x13', 'Il revient.', [['t-il'], ['t-revenir']]),
    sentence('x14', 'Il rentre.', [['t-il'], ['t-rentrer']]),
    sentence('x15', 'Il part.', [['t-il'], ['t-partir']]),
    sentence('x16', 'Il vient.', [['t-il'], ['t-venir']]),
    sentence('x17', 'Il va à Paris.', [['t-il'], ['t-aller'], ['t-a'], ['t-paris']]),
  ];
  expect(cases).toHaveLength(17);
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('a pronominal verb, a reflexive clitic or an elided one is skipped', () => {
  const cases: Sentence[] = [
    sentence('r1', 'Je me lave.', [['t-je'], ['t-me'], ['t-laver']]),
    sentence('r2', 'Tu te lèves.', [['t-tu'], ['t-te'], ['t-lever']]),
    sentence('r3', 'Il se lave.', [['t-il'], ['t-se'], ['t-laver']]),
    // `nous` and `vous` are subject clitics in the first slot and reflexive ones in the second.
    sentence('r4', 'Nous nous levons.', [['t-nous'], ['t-nous-reflexive'], ['t-lever']]),
    sentence('r5', 'Vous vous levez.', [['t-vous'], ['t-vous-reflexive'], ['t-lever']]),
    // An elided clitic lives in the verb token's prefix (`m’appelle`, `s’appelle`), not in a token of its own.
    sentence('r6', 'Je m’appelle Marie.', [['t-je'], ['t-me', 't-appeler'], ['t-marie']]),
    sentence('r7', 'Il s’appelle Marie.', [['t-il'], ['t-se', 't-appeler'], ['t-marie']]),
    sentence('r8', 'Ils s’appellent Marie.', [['t-ils'], ['t-se', 't-appeler'], ['t-marie']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('a lemma that is itself pronominal is skipped even when the surface has no clitic', () => {
  // `se laver` is the actual pronominal lemma; this row has no `se`/`s’` token or prefix, so it exercises the
  // pronominal-lemma branch while the rows above keep the surface-clitic and elided-prefix paths.
  const one = sentence('r9', 'Il lave les cahiers.', [['t-il'], ['t-se-laver'], ['t-les-article'], ['t-cahier']]);
  expect(passeCompose(one)).toBeNull();
});

test('a negated sentence is skipped with ne, with an elided n’ and with pas alone', () => {
  const cases: Sentence[] = [
    sentence('n1', 'Je ne mange pas.', [['t-je'], ['t-ne'], ['t-manger'], ['t-pas']]),
    sentence('n2', 'Il n’aime pas les cahiers.', [
      ['t-il'],
      ['t-ne', 't-aimer'],
      ['t-pas'],
      ['t-les-article'],
      ['t-cahier'],
    ]),
    // Spoken French drops `ne`; the negation still needs rebuilding around the auxiliary, so skip.
    sentence('n3', 'Il mange pas.', [['t-il'], ['t-manger'], ['t-pas']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('an elided n’ alone is skipped, so removing just its detection fails here', () => {
  // No standalone ne/jamais/pas: only the `n’` prefix marks these as negated.
  const cases: Sentence[] = [
    sentence('n4', 'Il n’aime que Marie.', [['t-il'], ['t-ne', 't-aimer'], ['t-que'], ['t-marie']]),
    // `y` is an adverbial pronoun, so it carries no function-clitic binding; without the prefix check this row
    // would wrongly produce `Je n’y a pensé.`. This is the row that isolates the n’ clause.
    sentence('n5', 'Je n’y pense.', [['t-je'], ['t-y-place'], ['t-penser']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('an object clitic already before the verb is skipped, written or elided', () => {
  const cases: Sentence[] = [
    sentence('c1', 'Elle me regarde.', [['t-elle'], ['t-me'], ['t-regarder']]),
    sentence('c2', 'Il le regarde.', [['t-il'], ['t-le-object'], ['t-regarder']]),
    sentence('c3', 'Elle les aime.', [['t-elle'], ['t-les-object'], ['t-aimer']]),
    sentence('c4', 'Il m’aime.', [['t-il'], ['t-me', 't-aimer']]),
    sentence('c5', 'Il l’aime.', [['t-il'], ['t-le-object', 't-aimer']]),
    sentence('c6', 'J’y pense.', [['t-je', 't-y-place'], ['t-penser']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('c’est is skipped because ç’a été is not built', () => {
  const cases: Sentence[] = [
    sentence('q1', 'C’est une table.', [['t-ce', 't-etre'], ['t-une'], ['t-table']]),
    sentence('q2', 'C’est le salon.', [['t-ce', 't-etre'], ['t-le-article'], ['t-salon']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('a verb outside the regular -er group, or a form that is not present, is skipped', () => {
  const cases: Sentence[] = [
    sentence('u1', 'Il finit.', [['t-il'], ['t-finir']]),
    sentence('u2', 'Il prend un livre.', [['t-il'], ['t-prendre'], ['t-un'], ['t-livre']]),
    // `aimait` is the imparfait; a present-form rule has no auxiliary for it.
    sentence('u3', 'Il aimait les cahiers.', [['t-il'], ['t-aimer'], ['t-les-article'], ['t-cahier']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

test('unsupported sentence structures and derived être verbs are skipped', () => {
  const cases: Sentence[] = [
    sentence('v1', 'Le livre rouge.', [['t-le-article'], ['t-livre'], ['t-rouge']]),
    sentence('v2', 'Marie chante et danse.', [['t-marie'], ['t-chanter'], ['t-et'], ['t-danser']]),
    // A pronominal infinitive after a modal is a second bound verb, and the clitic belongs to it.
    sentence('v3', 'Il faut se lever.', [['t-il'], ['t-falloir'], ['t-se'], ['t-lever']]),
    sentence('v4', 'Il retombe.', [['t-il'], ['t-retomber']]),
    sentence('v5', 'Voici les robes que Marie porte.', [
      ['t-voici'],
      ['t-les-article'],
      ['t-robe'],
      ['t-que'],
      ['t-marie'],
      ['t-porter'],
    ]),
    sentence('v6', 'Elle mange ?', [['t-elle'], ['t-manger']]),
    sentence('v7', 'Marie, mange une pomme.', [['t-marie'], ['t-manger'], ['t-une'], ['t-pomme']]),
    sentence('v8', 'Elle mange !', [['t-elle'], ['t-manger']]),
    sentence('v9', 'Marie, mange une pomme !', [['t-marie'], ['t-manger'], ['t-une'], ['t-pomme']]),
  ];
  for (const one of cases) expect(passeCompose(one)).toBeNull();
});

const i18n = i18next.createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } });
const family = PublishedReaderSchema.parse(starterJson.readers[1]);

test('the built unit carries the reader provenance, the passe-compose tag and the locale copy', () => {
  let id = 0;
  const [unit] = prepareReaderTransform({
    reader: family,
    kind: 'passe-compose',
    t: i18n.getFixedT('en'),
    makeId: () => `TEST-${++id}`,
    now: () => 123,
  });
  expect(family.body.id).toBe('a1-02');
  expect(unit.items.map((item) => item.id)).toEqual(['s1', 's2', 's3']);
  expect(unit.items.map((item) => item.prompt)).toEqual([
    'Ma mère aime les cahiers.',
    'Mes frères ont des stylos.',
    'J’ai un cahier.',
  ]);
  expect(unit.items.map((item) => item.expectedAnswer)).toEqual([
    'Ma mère a aimé les cahiers.',
    'Mes frères ont eu des stylos.',
    'J’ai eu un cahier.',
  ]);
  expect(unit.grammarTags).toEqual(['passe-compose']);
  expect(unit.title).toBe(en.readerTransform['passe-compose'].title);
  expect(unit.instruction).toBe(en.readerTransform['passe-compose'].instruction);
  expect(unit.setTitle).toBe(family.body.title.fr);
  expect(unit.level).toBe('A1');
  for (const item of unit.items) {
    expect(item.grammarTag).toBe('passe-compose');
    expect(item.explanation).toBe(en.readerTransform['passe-compose'].explanation);
    expect(item.meta).toEqual({
      source: 'reader-transform',
      readerId: 'a1-02',
      version: family.version,
      sentenceId: item.id,
      kind: 'passe-compose',
      ignoreSentencePunctuation: true,
    });
  }
});

test('the zh unit takes its title, instruction and explanation from the zh locale', () => {
  const [unit] = prepareReaderTransform({
    reader: family,
    kind: 'passe-compose',
    t: i18n.getFixedT('zh'),
    makeId: () => 'TEST-zh',
    now: () => 123,
  });
  expect(unit.title).toBe(zh.readerTransform['passe-compose'].title);
  expect(unit.instruction).toBe(zh.readerTransform['passe-compose'].instruction);
  for (const item of unit.items) expect(item.explanation).toBe(zh.readerTransform['passe-compose'].explanation);
});

test('the built unit grades the pass phrase without its final full stop and rejects the present tense', () => {
  const [unit] = prepareReaderTransform({
    reader: family,
    kind: 'passe-compose',
    t: i18n.getFixedT('en'),
    makeId: () => 'TEST-grade',
    now: () => 123,
  });
  const [, item] = unit.items;
  const answer = (singleAnswer: string) => ({ ...emptyAnswer(item), singleAnswer });
  const grade = (singleAnswer: string) => gradeItem('WORD_TRANSFORM', item, answer(singleAnswer), DEFAULT_GRADING);
  const typed = 'Mes frères ont eu des stylos';
  expect(grade(typed)).toEqual({ status: 'graded', correct: true, recordedAnswer: typed });
  const present = 'Mes frères ont des stylos.';
  expect(grade(present)).toEqual({ status: 'graded', correct: false, recordedAnswer: present });
});
