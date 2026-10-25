/** The game's challenge builder over invented cards and pools: the finder tiers, kind selection, options and grading. */
import { expect, test } from 'bun:test';
import {
  buildChallenge,
  challengeSeed,
  CHALLENGE_OPTIONS,
  cleanHeadword,
  findSurfaceForm,
  gradeChoice,
  gradeTyped,
  kindFor,
  MATURE_DAYS,
} from '../src/services/vocabulary/game/challenge';
import type {
  Challenge,
  ChallengePoolItem,
  ClozeChoice,
  GlossLanguage,
  RecognizeChallenge,
} from '../src/services/vocabulary/game/challenge';
import type { VocabularyBookSource, VocabularyRow, VocabularySchedule } from '../src/types/vocabulary';
import { vocabularyContextKey } from '../src/services/vocabulary/identity';
import { testAnalysis, testMatureSchedule, testRow } from './fixtures/vocabulary';

const now = new Date(2026, 9, 24, 12).getTime();
const sense = (en: string, examples: string[] = [], pos?: string): VocabularyBookSource['senses'][number] => ({
  pos,
  gloss: { en, zh: '测试' },
  examples: examples.map((fr) => ({ fr, en, zh: '测试' })),
});
const bookSource = (senses: VocabularyBookSource['senses']): VocabularyBookSource => ({
  bookId: 'tcf-7000',
  version: 'a'.repeat(64),
  sourceIds: ['0'],
  senses,
});
const card = (word: string, senses: VocabularyBookSource['senses'], schedule: VocabularySchedule | null = null) => ({
  ...testRow(word),
  bookSource: bookSource(senses),
  schedule,
});
const pool = (...items: [string, string, string?][]): ChallengePoolItem[] =>
  items.map(([word, gloss, pos]) => ({ word, gloss, pos }));
const youngReview = { ...testMatureSchedule(now), scheduledDays: 20, repetitions: 9 };
const learning = { ...testMatureSchedule(now), phase: 'learning' as const, scheduledDays: 0, learningSteps: 1 };
/** Invented lemma → forms, the shape the caller builds from the bundled lexicon. */
const knownForms = (forms: Record<string, string[]>) => {
  const index = new Map(Object.entries(forms).map(([lemma, list]) => [lemma, new Set(list)]));
  return (lemma: string) => index.get(lemma);
};

interface BuildInput {
  card: VocabularyRow;
  pool?: ChallengePoolItem[];
  appearance?: number;
  lang?: GlossLanguage;
  voiceAvailable?: boolean;
  formsOf?: (lemma: string) => ReadonlySet<string> | undefined;
}

const build = (input: BuildInput): Challenge | undefined =>
  buildChallenge({
    card: input.card,
    pool: input.pool ?? [],
    seed: challengeSeed('2026-10-24', input.card.key, input.appearance ?? 0),
    lang: input.lang ?? 'en',
    voiceAvailable: input.voiceAvailable ?? false,
    formsOf: input.formsOf,
  });

function expectKind<K extends Challenge['kind']>(input: BuildInput, kind: K): Extract<Challenge, { kind: K }> {
  const built = build(input);
  if (built?.kind !== kind) throw new Error(`expected a ${kind} challenge, got ${built?.kind ?? 'none'}`);
  return built as Extract<Challenge, { kind: K }>;
}

/** A cloze challenge that offers options: the answer index is what grades it. */
function expectClozeChoice(input: BuildInput): ClozeChoice {
  const challenge = expectKind(input, 'cloze');
  const { options, answerIndex } = challenge;
  if (!options || answerIndex === undefined) throw new Error('expected a cloze challenge with options');
  return { ...challenge, options, answerIndex };
}

test('the finder returns the headword as a token with the position of the surface form', () => {
  expect(findSurfaceForm('La maison est grande.', 'maison')).toEqual({ start: 3, end: 9, text: 'maison' });
  expect(findSurfaceForm('Rien de tel ici.', 'maison')).toBeUndefined();
});

test('cleanHeadword removes parenthesised parts, placeholders, feminine markers and trailing punctuation', () => {
  expect(cleanHeadword('abattre ( s’)')).toBe('abattre');
  expect(cleanHeadword('aborder qqn')).toBe('aborder');
  expect(cleanHeadword('aborder qqch.')).toBe('aborder');
  expect(cleanHeadword('abstrait ,e')).toBe('abstrait');
  expect(cleanHeadword('  Abattre ( s’ ) ?')).toBe('abattre');
  expect(cleanHeadword('pomme de terre')).toBe('pomme de terre');
});

test('the finder cleans a parenthesised headword before matching it in a sentence', () => {
  expect(findSurfaceForm('Il faut abattre cet arbre.', 'abattre ( s’)')).toMatchObject({ text: 'abattre' });
  expect(findSurfaceForm('Elle aborde le sujet.', 'aborder qqn')).toBeUndefined();
});

test('the finder takes a known lexicon form when cleaning alone does not match', () => {
  expect(
    findSurfaceForm('Elle aborde le sujet.', 'aborder qqn', knownForms({ aborder: ['aborde', 'abordent'] })),
  ).toMatchObject({
    text: 'aborde',
  });
  expect(findSurfaceForm('Ils abondent ici.', 'abonder', knownForms({ abonder: ['abondent'] }))).toMatchObject({
    text: 'abondent',
  });
});

test('the finder tries a simple ending on the cleaned headword', () => {
  expect(findSurfaceForm('Les grands arbres.', 'grand')).toMatchObject({ text: 'grands' });
  expect(findSurfaceForm('Une idée abstraite.', 'abstrait ,e')).toMatchObject({ text: 'abstraite' });
});

test('the finder matches a multi-word headword as a substring, cleaned or not', () => {
  expect(findSurfaceForm('Il mange une pomme de terre chaude.', 'pomme de terre')).toMatchObject({
    text: 'pomme de terre',
  });
  expect(findSurfaceForm('Il est à bas de la pente.', 'à bas de (qqch)')).toMatchObject({ text: 'à bas de' });
});

test('the finder respects elision: the blank covers the elided word only', () => {
  expect(findSurfaceForm('L’eau est froide.', 'eau')).toEqual({ start: 2, end: 5, text: 'eau' });
});

test('the finder keeps the tier order: the headword itself wins over an earlier known form', () => {
  expect(findSurfaceForm('Elle aborde, puis aborder.', 'aborder', knownForms({ aborder: ['aborde'] }))).toMatchObject({
    text: 'aborder',
  });
});

const state = (schedule: VocabularySchedule | null, clozeFound = true, voiceAvailable = true) => ({
  schedule,
  clozeFound,
  voiceAvailable,
});
const newSchedule: VocabularySchedule = {
  phase: 'new',
  dueAt: now,
  lastReviewedAt: null,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  repetitions: 0,
  lapses: 0,
};

test('a new card asks for the meaning', () => {
  expect(kindFor(state(null))).toBe('recognize');
  expect(kindFor(state(newSchedule))).toBe('recognize');
});

test('a learning or relearning card fills a blank among options, and asks for the meaning without an example', () => {
  expect(kindFor(state(learning))).toBe('cloze');
  expect(kindFor(state({ ...learning, phase: 'relearning', learningSteps: 0 }))).toBe('cloze');
  expect(kindFor(state(learning, false))).toBe('recognize');
  expect(kindFor(state({ ...learning, phase: 'relearning', learningSteps: 0 }, false))).toBe('recognize');
});

test('a young review types the blank, or produces the word when no example holds it', () => {
  expect(kindFor(state(youngReview))).toBe('cloze');
  expect(kindFor(state(youngReview, false))).toBe('produce');
});

test('the mature threshold decides between hearing the word and producing it', () => {
  expect(MATURE_DAYS).toBe(21);
  expect(kindFor(state({ ...youngReview, scheduledDays: MATURE_DAYS - 1 }))).toBe('cloze');
  expect(kindFor(state({ ...youngReview, scheduledDays: MATURE_DAYS }))).toBe('listen');
  expect(kindFor(state({ ...youngReview, scheduledDays: MATURE_DAYS }, true, false))).toBe('produce');
  expect(kindFor(state({ ...youngReview, scheduledDays: 40 }, true, false))).toBe('produce');
});

test('recognize offers the meaning among four options with the gloss of the card', () => {
  const result = expectKind(
    {
      card: card('maison', [sense('house', [], 'nom')]),
      pool: pool(['arbre', 'tree', 'nom'], ['chien', 'dog', 'nom'], ['chat', 'cat', 'nom']),
    },
    'recognize',
  );
  expect(result.prompt).toBe('maison');
  expect(result.options).toHaveLength(CHALLENGE_OPTIONS);
  expect(result.options[result.answerIndex]).toBe('house');
  expect(result.options.filter((option) => option === 'house')).toHaveLength(1);
});

test('a returning card gets different options from the appearance index in the seed', () => {
  const input = {
    card: card('maison', [sense('house', [], 'nom')]),
    pool: pool(['arbre', 'tree'], ['chien', 'dog'], ['chat', 'cat']),
  };
  expect(challengeSeed('2026-10-24', 'maison', 2)).not.toBe(challengeSeed('2026-10-24', 'maison', 3));
  const orders = [0, 1, 2, 3].map((appearance) => expectKind({ ...input, appearance }, 'recognize').options.join('|'));
  expect(new Set(orders).size).toBeGreaterThan(1);
});

test('distractors never equal the answer, never repeat a gloss and prefer the card’s part of speech', () => {
  const sameGloss = expectKind(
    {
      card: card('maison', [sense('house', [], 'nom')]),
      pool: pool(
        ['arbre', 'house', 'nom'],
        ['toit', 'house', 'nom'],
        ['chien', 'dog', 'nom'],
        ['chat', 'cat', 'verbe'],
      ),
    },
    'recognize',
  );
  expect([...sameGloss.options].sort()).toEqual(['cat', 'dog', 'house']);
  const samePos = expectKind(
    {
      card: card('maison', [sense('house', [], 'nom')]),
      pool: pool(
        ['un', 'one', 'nom'],
        ['deux', 'two', 'nom'],
        ['trois', 'three', 'nom'],
        ['voir', 'see', 'verbe'],
        ['cinq', 'five', 'verbe'],
      ),
    },
    'recognize',
  );
  expect([...samePos.options].sort()).toEqual(['house', 'one', 'three', 'two']);
});

test('a missing part of speech on either side falls back to any card', () => {
  const result = expectKind(
    { card: card('maison', [sense('house')]), pool: pool(['arbre', 'tree'], ['chien', 'dog', 'nom'], ['chat', 'cat']) },
    'recognize',
  );
  expect(result.options).toHaveLength(CHALLENGE_OPTIONS);
  expect(result.options[result.answerIndex]).toBe('house');
});

test('the options drop to two with one distractor and the card is just flipped with none', () => {
  const input = { card: card('maison', [sense('house', [], 'nom')]) };
  expect(expectKind({ ...input, pool: pool(['arbre', 'tree'], ['chien', 'house']) }, 'recognize').options).toHaveLength(
    2,
  );
  expect(build(input)).toBeUndefined();
});

test('a personal word takes its gloss from its own context and its pool from the learner’s other cards', () => {
  const personal = (analysis: ReturnType<typeof testAnalysis>): VocabularyRow['contexts'][number] => ({
    id: vocabularyContextKey({ sentence: 'Une phrase avec mot.', requestLanguage: 'en' }),
    sentence: 'Une phrase avec mot.',
    savedAt: now,
    requestLanguage: 'en',
    definition: { kind: 'ai', analysis },
  });
  const contexts = [personal({ ...testAnalysis('mot'), translation: 'TEST zh', translationEn: 'TEST en' })];
  const english = expectKind(
    {
      card: { ...testRow('mot'), bookSource: undefined, contexts },
      pool: pool(['arbre', 'tree'], ['chien', 'dog'], ['chat', 'cat']),
    },
    'recognize',
  );
  expect(english.prompt).toBe('mot');
  expect(english.options).toContain('TEST en');
  const chinese = expectKind(
    {
      card: { ...testRow('mot'), bookSource: undefined, contexts },
      pool: pool(['arbre', 'tree'], ['chien', 'dog'], ['chat', 'cat']),
      lang: 'zh',
    },
    'recognize',
  );
  expect(chinese.options).toContain('TEST zh');
});

test('a young review types the blank, found through the elision of the sentence', () => {
  const result = expectKind(
    {
      card: card('eau', [sense('water', ['L’eau est froide.'])], youngReview),
      pool: pool(['mer', 'sea'], ['air', 'air'], ['sol', 'ground']),
    },
    'cloze',
  );
  expect(result).toMatchObject({ before: 'L’', blank: 'eau', after: ' est froide.', expected: 'eau' });
  expect(result.options).toBeUndefined();
});

test('a learning card fills the blank among options, and is just flipped when the pool is empty', () => {
  const input = { card: card('eau', [sense('water', ['L’eau est froide.'])], learning) };
  const choice = expectClozeChoice({ ...input, pool: pool(['mer', 'sea'], ['air', 'air'], ['sol', 'ground']) });
  expect(choice).toMatchObject({ blank: 'eau', expected: 'eau' });
  expect(choice.options).toHaveLength(CHALLENGE_OPTIONS);
  expect(choice.options[choice.answerIndex]).toBe('eau');
  expect(gradeChoice(choice, choice.answerIndex)).toEqual({ correct: true, expected: 'eau' });
  expect(gradeChoice(choice, (choice.answerIndex + 1) % CHALLENGE_OPTIONS).correct).toBe(false);
  expect(expectClozeChoice({ ...input, pool: pool(['mer', 'sea']) }).options).toHaveLength(2);
  expect(build(input)).toBeUndefined();
});

test('a young review without a findable form produces the word instead', () => {
  expect(expectKind({ card: card('maison', [sense('house', ['Rien ici.'])], youngReview) }, 'produce')).toMatchObject({
    clue: 'house',
    expected: 'maison',
  });
});

test('a mature card is heard when the device has a voice, and produced from its gloss when it does not', () => {
  const mature = { ...youngReview, scheduledDays: MATURE_DAYS };
  expect(
    expectKind({ card: card('maison', [sense('house', [], 'nom')], mature), voiceAvailable: true }, 'listen'),
  ).toMatchObject({
    clue: 'house',
    expected: 'maison',
  });
  expect(expectKind({ card: card('maison', [sense('house', [], 'nom')], mature) }, 'produce')).toMatchObject({
    clue: 'house',
    pos: 'nom',
    expected: 'maison',
  });
});

test('produce ignores a leading article on either side', () => {
  const challenge = { kind: 'produce' as const, clue: 'house', expected: 'maison' };
  expect(gradeTyped(challenge, 'la maison', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(challenge, 'une maison', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(challenge, 'maison', { strictAccents: true }).correct).toBe(true);
  const elided = { kind: 'produce' as const, clue: 'water', expected: 'eau' };
  expect(gradeTyped(elided, 'l’eau', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(elided, 'les eaux', { strictAccents: true }).correct).toBe(false);
});

test('gradeTyped folds case and spacing, follows strict accents and accepts no synonym', () => {
  const challenge = { kind: 'produce' as const, clue: 'coffee', expected: 'café' };
  expect(gradeTyped(challenge, '  CAFÉ  ', { strictAccents: true })).toEqual({ correct: true, expected: 'café' });
  expect(gradeTyped(challenge, 'cafe', { strictAccents: true }).correct).toBe(false);
  expect(gradeTyped(challenge, 'cafe', { strictAccents: false }).correct).toBe(true);
  expect(
    gradeTyped({ kind: 'produce', clue: 'big', expected: 'grand' }, 'gros', { strictAccents: false }).correct,
  ).toBe(false);
  const listen = { kind: 'listen' as const, clue: 'big', expected: 'grand' };
  expect(gradeTyped(listen, 'grand', { strictAccents: true })).toEqual({ correct: true, expected: 'grand' });
});

test('gradeChoice reads the answer by index', () => {
  const challenge: RecognizeChallenge = {
    kind: 'recognize',
    prompt: 'maison',
    options: ['house', 'tree', 'cat'],
    answerIndex: 0,
  };
  expect(gradeChoice(challenge, 0)).toEqual({ correct: true, expected: 'house' });
  expect(gradeChoice(challenge, 2)).toEqual({ correct: false, expected: 'house' });
});
