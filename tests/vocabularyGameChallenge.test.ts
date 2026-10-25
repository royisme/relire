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
const pool = (...items: [string, string | ChallengePoolItem['gloss'], string?][]): ChallengePoolItem[] =>
  items.map(([word, gloss, pos]) => ({
    word,
    gloss: typeof gloss === 'string' ? { en: gloss, zh: gloss } : gloss,
    pos,
  }));
const youngReview = { ...testMatureSchedule(now), scheduledDays: 20, repetitions: 9 };
const learning = { ...testMatureSchedule(now), phase: 'learning' as const, scheduledDays: 0, learningSteps: 1 };
/** Invented lemma → forms, the shape the caller builds from the bundled lexicon. */
const knownForms = (forms: Record<string, string[]>) => {
  const index = new Map(Object.entries(forms).map(([lemma, list]) => [lemma, new Set(list)]));
  return (lemma: string) => index.get(lemma);
};
const personal = (analysis: ReturnType<typeof testAnalysis>): VocabularyRow['contexts'][number] => ({
  id: vocabularyContextKey({ sentence: 'Une phrase avec mot.', requestLanguage: 'en' }),
  sentence: 'Une phrase avec mot.',
  savedAt: now,
  requestLanguage: 'en',
  definition: { kind: 'ai', analysis },
});

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

test('the finder returns the headword as a token, with offsets into the NFC sentence it returns', () => {
  expect(findSurfaceForm('La maison est grande.', 'maison')).toEqual({
    start: 3,
    end: 9,
    text: 'maison',
    sentence: 'La maison est grande.',
  });
  expect(findSurfaceForm('Rien de tel ici.', 'maison')).toBeUndefined();
});

test('the finder matches a decomposed sentence on the NFC copy the position carries', () => {
  const found = findSurfaceForm('Le café est froid.'.normalize('NFD'), 'café');
  if (!found) throw new Error('expected a found position');
  // Slicing the decomposed original with these offsets would return `cafe`, so the caller slices `sentence`.
  expect(found.sentence).toBe('Le café est froid.');
  expect(found.sentence.slice(found.start, found.end)).toBe('café');
});

test('a letter plus a combining mark is one token, not split', () => {
  // `n` + diaeresis has no precomposed form, so even the NFC copy carries the mark separately from its letter.
  expect(findSurfaceForm('Le n\u0308 est là.', 'n\u0308')).toEqual({
    start: 3,
    end: 5,
    text: 'n\u0308',
    sentence: 'Le n\u0308 est là.',
  });
});

test('cleanHeadword removes parenthesised parts, placeholders, feminine markers and trailing punctuation', () => {
  expect(cleanHeadword('abattre ( s’)')).toBe('abattre');
  expect(cleanHeadword('aborder qqn')).toBe('aborder');
  expect(cleanHeadword('aborder qqch.')).toBe('aborder');
  expect(cleanHeadword('abstrait ,e')).toBe('abstrait');
  expect(cleanHeadword('  Abattre ( s’ ) ?')).toBe('Abattre');
  expect(cleanHeadword('Noël')).toBe('Noël');
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

test('the finder matches a multi-word headword as a bounded substring, cleaned or not', () => {
  expect(findSurfaceForm('Il mange une pomme de terre chaude.', 'pomme de terre')).toMatchObject({
    text: 'pomme de terre',
  });
  expect(findSurfaceForm('Il est à bas de la pente.', 'à bas de (qqch)')).toMatchObject({ text: 'à bas de' });
  // `à bas de` must not be found inside `là bas de`: letters may not touch the match.
  expect(findSurfaceForm('Il est là bas de la pente.', 'à bas de')).toBeUndefined();
});

test('a token next to a hyphen is another word, but a hyphenated headword is found whole', () => {
  expect(findSurfaceForm('Sa grand-mère dort.', 'grand')).toBeUndefined();
  expect(findSurfaceForm('De grands-mères doutent.', 'grand')).toBeUndefined();
  expect(findSurfaceForm('Sa grand-mère dort.', 'grand-mère')).toMatchObject({ text: 'grand-mère' });
  expect(findSurfaceForm('Un grand arbre.', 'grand')).toMatchObject({ text: 'grand' });
});

test('the finder respects elision: the blank covers the elided word only', () => {
  expect(findSurfaceForm('L’eau est froide.', 'eau')).toEqual({
    start: 2,
    end: 5,
    text: 'eau',
    sentence: 'L’eau est froide.',
  });
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

test('the mature boundary is 21 scheduled days: 20 is still young, 21 is mature', () => {
  expect(kindFor(state({ ...youngReview, scheduledDays: 20 }))).toBe('cloze');
  expect(kindFor(state({ ...youngReview, scheduledDays: 21 }))).toBe('listen');
  expect(kindFor(state({ ...youngReview, scheduledDays: 40 }))).toBe('listen');
  expect(kindFor(state({ ...youngReview, scheduledDays: 21 }, true, false))).toBe('produce');
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

test('the card’s own word is never an option, whatever gloss the pool gives it', () => {
  const sameWord = expectKind(
    {
      card: card('maison', [sense('house', [], 'nom')]),
      pool: pool(['maison', 'building'], ['chien', 'dog', 'nom'], ['chat', 'cat', 'nom'], ['loup', 'wolf', 'nom']),
    },
    'recognize',
  );
  expect(sameWord.options).not.toContain('building');
  expect(sameWord.options).toHaveLength(CHALLENGE_OPTIONS);
  const choice = expectClozeChoice({
    card: card('eau', [sense('water', ['L’eau est froide.'])], learning),
    pool: pool(['eau', 'drink', 'nom'], ['mer', 'sea', 'nom'], ['air', 'air', 'nom'], ['sol', 'ground', 'nom']),
  });
  expect(choice.options.filter((option) => option === 'eau')).toHaveLength(1);
});

test('a missing part of speech on either side falls back to any card', () => {
  const result = expectKind(
    { card: card('maison', [sense('house')]), pool: pool(['arbre', 'tree'], ['chien', 'dog', 'nom'], ['chat', 'cat']) },
    'recognize',
  );
  expect(result.options).toHaveLength(CHALLENGE_OPTIONS);
  expect(result.options[result.answerIndex]).toBe('house');
});

test('recognize never mixes languages: a card or entry without the app language is out', () => {
  const contexts = [personal({ ...testAnalysis('mot'), translation: '测试' })];
  // Without `translationEn` the card has no English gloss: no clue to show, no meaning to choose, just flip. A
  // mature card falls there from `listen` (with a voice) and from `produce` (without one).
  const glossless = { ...testRow('mot'), bookSource: undefined, contexts };
  expect(build({ card: glossless })).toBeUndefined();
  expect(
    build({ card: { ...glossless, schedule: { ...youngReview, scheduledDays: 21 } }, voiceAvailable: true }),
  ).toBeUndefined();
  expect(build({ card: { ...glossless, schedule: { ...youngReview, scheduledDays: 21 } } })).toBeUndefined();
  const english = expectKind(
    {
      card: {
        ...testRow('mot'),
        bookSource: undefined,
        contexts: [personal({ ...testAnalysis('mot'), translation: '测试', translationEn: 'word' })],
      },
      pool: pool(['arbre', { zh: '树' }], ['chien', 'dog'], ['chat', 'cat'], ['loup', 'wolf']),
    },
    'recognize',
  );
  expect([...english.options].sort()).toEqual(['cat', 'dog', 'wolf', 'word']);
});

test('a personal word takes its gloss from its own context and its pool from the learner’s other cards', () => {
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

test('a typed cloze expects the sentence’s surface form, capitalised as written', () => {
  const typed = expectKind({ card: card('maison', [sense('house', ['Maison bleue.'])], youngReview) }, 'cloze');
  expect(typed).toMatchObject({ before: '', blank: 'Maison', after: ' bleue.', expected: 'Maison' });
  expect(gradeTyped(typed, 'maison', { strictAccents: true }).correct).toBe(true);
});

test('a choice cloze chooses the headword, not the sentence’s form', () => {
  const choice = expectClozeChoice({
    card: card('eau', [sense('water', ['Eau vive partout !'])], learning),
    pool: pool(['mer', 'sea'], ['air', 'air'], ['sol', 'ground']),
  });
  // The blank shows where the sentence's form goes; the options are headwords in their own case.
  expect(choice.blank).toBe('Eau');
  expect(choice.options[choice.answerIndex]).toBe('eau');
  expect(choice.options).not.toContain('Eau');
  expect(gradeChoice(choice, choice.answerIndex)).toEqual({ correct: true, expected: 'eau' });
  expect(gradeChoice(choice, (choice.answerIndex + 1) % choice.options.length).correct).toBe(false);
  const noel = expectClozeChoice({
    card: card('Noël', [sense('Christmas', ['À Noël, il neige.'])], learning),
    pool: pool(['hiver', 'winter'], ['été', 'summer'], ['printemps', 'spring']),
  });
  expect(noel.options[noel.answerIndex]).toBe('Noël');
});

test('a choice cloze never offers a synonym: an entry with the card’s gloss is out', () => {
  const choice = expectClozeChoice({
    card: card('eau', [sense('water', ['L’eau est froide.'])], learning),
    pool: pool(['mer', 'water', 'nom'], ['air', 'air', 'nom'], ['sol', 'ground', 'nom'], ['pluie', 'rain', 'nom']),
  });
  expect(choice.options).not.toContain('mer');
  expect(choice.options).toHaveLength(CHALLENGE_OPTIONS);
});

test('a learning card fills the blank among options, and is just flipped when the pool is empty', () => {
  const input = { card: card('eau', [sense('water', ['L’eau est froide.'])], learning) };
  const choice = expectClozeChoice({ ...input, pool: pool(['mer', 'sea'], ['air', 'air'], ['sol', 'ground']) });
  expect(choice).toMatchObject({ blank: 'eau', expected: 'eau' });
  expect(choice.options).toHaveLength(CHALLENGE_OPTIONS);
  expect(choice.options[choice.answerIndex]).toBe('eau');
  expect(build(input)).toBeUndefined();
});

test('the fall-back ladder: two distractors leave three options, one leaves two, none flips the card', () => {
  const input = { card: card('maison', [sense('house', ['La maison est belle.'])], learning) };
  expect(expectClozeChoice({ ...input, pool: pool(['arbre', 'tree'], ['chien', 'dog']) }).options).toHaveLength(3);
  expect(expectClozeChoice({ ...input, pool: pool(['arbre', 'tree'], ['chien', 'house']) }).options).toHaveLength(2);
  // The choice falls to the meaning, which draws on the same pool: without a distractor the card is just flipped.
  expect(build({ ...input, pool: pool(['maison', 'building'], ['maison', 'home']) })).toBeUndefined();
});

test('a young review without a findable form produces the word instead', () => {
  expect(expectKind({ card: card('maison', [sense('house', ['Rien ici.'])], youngReview) }, 'produce')).toMatchObject({
    clue: 'house',
    expected: 'maison',
  });
});

test('a mature card is heard with a voice, produced without one, both expecting the cleaned headword', () => {
  const mature = { ...youngReview, scheduledDays: 21 };
  expect(
    expectKind({ card: card('maison', [sense('house', [], 'nom')], mature), voiceAvailable: true }, 'listen'),
  ).toMatchObject({ clue: 'house', expected: 'maison' });
  expect(expectKind({ card: card('maison', [sense('house', [], 'nom')], mature) }, 'produce')).toMatchObject({
    clue: 'house',
    pos: 'nom',
    expected: 'maison',
  });
  const heard = expectKind(
    { card: card('Noël', [sense('Christmas', [], 'n. m.')], mature), voiceAvailable: true },
    'listen',
  );
  expect(heard).toMatchObject({ clue: 'Christmas', expected: 'Noël' });
  expect(gradeTyped(heard, 'noël', { strictAccents: true }).correct).toBe(true);
  expect(expectKind({ card: card('abattre ( s’)', [sense('to fell', [], 'v.')], mature) }, 'produce')).toMatchObject({
    clue: 'to fell',
    pos: 'v.',
    expected: 'abattre',
  });
});

test('produce ignores a leading article on either side, for a noun only', () => {
  const noun = { kind: 'produce' as const, clue: 'house', pos: 'n.', expected: 'maison' };
  expect(gradeTyped(noun, 'la maison', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(noun, 'une maison', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(noun, 'maison', { strictAccents: true }).correct).toBe(true);
  const elided = { kind: 'produce' as const, clue: 'water', pos: 'n. f.', expected: 'eau' };
  expect(gradeTyped(elided, 'l’eau', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(elided, 'l’ eau', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(elided, 'les eaux', { strictAccents: true }).correct).toBe(false);
  const verb = { kind: 'produce' as const, clue: 'to rent', pos: 'v.', expected: 'louer' };
  expect(gradeTyped(verb, 'le louer', { strictAccents: true }).correct).toBe(false);
  expect(gradeTyped(verb, 'louer', { strictAccents: true }).correct).toBe(true);
});

test('grading accepts the raw headword as well as its cleaned lemma', () => {
  const challenge = { kind: 'produce' as const, clue: 'to approach', pos: 'v.', expected: 'aborder' };
  expect(gradeTyped(challenge, 'aborder qqn', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(challenge, 'aborder qqch.', { strictAccents: true }).correct).toBe(true);
  expect(gradeTyped(challenge, 'aborder', { strictAccents: true }).correct).toBe(true);
});

test('gradeTyped folds case and spacing, follows strict accents and accepts no synonym', () => {
  const challenge = { kind: 'produce' as const, clue: 'coffee', pos: 'n. m.', expected: 'café' };
  expect(gradeTyped(challenge, '  CAFÉ  ', { strictAccents: true })).toEqual({ correct: true, expected: 'café' });
  expect(gradeTyped(challenge, 'cafe', { strictAccents: true }).correct).toBe(false);
  expect(gradeTyped(challenge, 'cafe', { strictAccents: false }).correct).toBe(true);
  expect(
    gradeTyped({ kind: 'produce', clue: 'big', pos: 'adj.', expected: 'grand' }, 'gros', { strictAccents: false })
      .correct,
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
  const cloze: ClozeChoice = {
    kind: 'cloze',
    before: 'L’',
    blank: 'eau',
    after: ' est froide.',
    expected: 'eau',
    options: ['mer', 'eau', 'air'],
    answerIndex: 1,
  };
  expect(gradeChoice(cloze, 1)).toEqual({ correct: true, expected: 'eau' });
  expect(gradeChoice(cloze, 0)).toEqual({ correct: false, expected: 'eau' });
});
