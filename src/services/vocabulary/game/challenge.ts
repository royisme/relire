/**
 * Owns the game's one retrieval challenge per card: the kind read from the card's real state, the seeded options, the
 * surface-form finder and answer grading. Pure: no UI, i18n, storage, AI or review write; the challenge informs the
 * learner and never touches the schedule.
 */
import type { VocabularyBookSource, VocabularyRow, VocabularySchedule } from '../../../types/vocabulary';

export type ChallengeKind = 'recognize' | 'cloze' | 'listen' | 'produce';
export type GlossLanguage = 'en' | 'zh';

/** A card in `review` at or above this many scheduled days is mature (Anki's convention, the plan's fork 2). */
export const MATURE_DAYS = 21;
/** Options of a choice challenge: the answer plus at most three distractors. */
export const CHALLENGE_OPTIONS = 4;
/** Simple endings tried after cleaning a one-word headword; the lead measured these tiers on the real book. */
const SIMPLE_ENDINGS = ['', 'e', 's', 'es', 'x', 'é', 'ée', 'ées', 'és'];
const LEADING_ARTICLE = /^(?:le|la|les|un|une|des)\s+|^l['’]/;

/** The found form as it appears in the sentence: `start`/`end` index the original sentence, not the folded copy. */
export interface ChallengePosition {
  start: number;
  end: number;
  text: string;
}

interface Span {
  start: number;
  end: number;
  text: string;
}

/** One card, as much as a challenge reads of it: a `VocabularyRow` itself satisfies this shape. */
export interface ChallengeCard {
  word: string;
  bookSource?: VocabularyBookSource;
  contexts: VocabularyRow['contexts'];
  schedule: VocabularySchedule | null;
}

/** A word the learner may see as a distractor: another card of theirs, or a book entry when the book is present. */
export interface ChallengePoolItem {
  word: string;
  gloss: string;
  pos?: string;
}

export interface ChallengeState {
  schedule: VocabularySchedule | null;
  /** The finder located a surface form in one of the card's examples. */
  clozeFound: boolean;
  voiceAvailable: boolean;
}

export interface RecognizeChallenge {
  kind: 'recognize';
  prompt: string;
  options: string[];
  answerIndex: number;
}

export interface ClozeChallenge {
  kind: 'cloze';
  before: string;
  blank: string;
  after: string;
  expected: string;
  /** Present when the learner picks the form among options instead of typing it. */
  options?: string[];
  answerIndex?: number;
}

/** A cloze challenge that offers the form among options, so the learner's pick is graded by index. */
export type ClozeChoice = ClozeChallenge & { options: string[]; answerIndex: number };

export interface ListenChallenge {
  kind: 'listen';
  clue: string;
  expected: string;
}

export interface ProduceChallenge {
  kind: 'produce';
  clue: string;
  pos?: string;
  expected: string;
}

export type Challenge = RecognizeChallenge | ClozeChallenge | ListenChallenge | ProduceChallenge;

export interface GradingOptions {
  /** The learner's "strict accents" preference (`practiceGrading`). */
  strictAccents: boolean;
}

export interface ChallengeGrade {
  correct: boolean;
  expected: string;
}

/** `date|key|appearance`; `appearance` is the card's history length plus its appearances so far in this session. */
export const challengeSeed = (date: string, key: string, appearance: number) => `${date}|${key}|${appearance}`;

const foldText = (text: string) => text.normalize('NFC').toLowerCase().replace(/’/g, "'");

/**
 * The headword as the book writes it, reduced to the lemma a sentence or the lexicon can match: folded, without
 * parenthesised parts (`abattre ( s’)`), the placeholders `qqn`/`qqch`/`qch`/`qn`, a feminine marker after a comma
 * (`abstrait ,e`) and trailing punctuation.
 */
export function cleanHeadword(word: string): string {
  return foldText(word)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:qqn|qqch|qch|qn)\b\.?/g, ' ')
    .replace(/\s*,\s*(?:e|ne|ère|euse|ve|ale|elle|ette|ienne|rice)\b/g, '')
    .replace(/[?!.,;:…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A multi-word `want` as a substring of the folded sentence: the measured tiers match those without word boundaries. */
const findSpan = (folded: string, want: string): Span | undefined => {
  const at = folded.indexOf(want);
  return at < 0 ? undefined : { start: at, end: at + want.length, text: want };
};

/**
 * Where the headword appears in one sentence, or undefined. Tiers in order: the folded headword itself (a token, or a
 * substring when it has several words); a known form of it from `formsOf`; the cleaned headword plus a simple ending
 * or, when it has several words, as a substring. Elision is respected: in `L’eau est froide` the token `eau` is the
 * surface form, so a blank covers `eau` only. `formsOf` receives the cleaned headword, the key the lexicon uses.
 */
export function findSurfaceForm(
  sentence: string,
  headword: string,
  formsOf?: (lemma: string) => ReadonlySet<string> | undefined,
): ChallengePosition | undefined {
  // Folding is not length-preserving in general, but it is for the app's NFC French text, so the offsets stay valid.
  const folded = foldText(sentence);
  const spans = [...folded.matchAll(/\p{L}+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }));
  const surface = (span: Span): ChallengePosition => ({
    start: span.start,
    end: span.end,
    text: sentence.slice(span.start, span.end),
  });
  const occurrence = (want: string) =>
    /\s/.test(want) ? findSpan(folded, want) : spans.find((span) => span.text === want);
  const exact = occurrence(foldText(headword).trim());
  if (exact) return surface(exact);
  const forms = [...(formsOf?.(cleanHeadword(headword)) ?? [])]
    .map((form) => occurrence(foldText(form).trim()))
    .filter((span): span is Span => span !== undefined)
    .sort((left, right) => left.start - right.start);
  if (forms[0]) return surface(forms[0]);
  const cleaned = cleanHeadword(headword);
  const cleanedSpans = /\s/.test(cleaned)
    ? [findSpan(folded, cleaned)].filter((span): span is Span => span !== undefined)
    : spans.filter((span) => SIMPLE_ENDINGS.some((ending) => span.text === cleaned + ending));
  return cleanedSpans[0] ? surface(cleanedSpans[0]) : undefined;
}

/**
 * The kind the card's real state calls for, before the pool is known: a new card asks for the meaning, a learning
 * card fills a blank among options, a young review types the blank or produces the word, a mature card is heard.
 */
export function kindFor(state: ChallengeState): ChallengeKind {
  const schedule = state.schedule;
  if (!schedule || schedule.phase === 'new') return 'recognize';
  if (schedule.phase === 'review')
    return schedule.scheduledDays < MATURE_DAYS
      ? state.clozeFound
        ? 'cloze'
        : 'produce'
      : state.voiceAvailable
        ? 'listen'
        : 'produce';
  return state.clozeFound ? 'cloze' : 'recognize';
}

/** A string-hashed mulberry32: deterministic options for the same seed and a different order for another one. */
function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = result[index];
    result[index] = result[swap];
    result[swap] = held;
  }
  return result;
}

interface CardContent {
  gloss: string;
  pos?: string;
  examples: string[];
}

/** The card's first sense in the app language, or a personal word's first context; `pos` is only ever a hint. */
function cardContent(card: ChallengeCard, lang: GlossLanguage): CardContent {
  const sense = card.bookSource?.senses[0];
  const context = card.contexts[0];
  const definition = context?.definition;
  const contextGloss = definition
    ? definition.kind === 'ai'
      ? lang === 'en'
        ? (definition.analysis.translationEn ?? definition.analysis.translation)
        : definition.analysis.translation
      : definition.entry.gloss[lang]
    : '';
  const contextPos =
    definition?.kind === 'ai' ? definition.analysis.partOfSpeech.trim() || undefined : definition?.entry.pos;
  return {
    gloss: sense?.gloss[lang] ?? contextGloss,
    pos: sense?.pos ?? contextPos,
    examples: [
      ...(card.bookSource?.senses.flatMap((entry) => entry.examples.map((example) => example.fr)) ?? []),
      ...card.contexts.flatMap((entry) =>
        entry.definition.kind === 'ai'
          ? (entry.definition.analysis.usageExamples ?? []).map((example) => example.fr)
          : [],
      ),
      ...card.contexts.map((entry) => entry.sentence),
    ],
  };
}

/**
 * Up to three option texts for a choice challenge: same part of speech first when both sides name one, then any;
 * the answer's own gloss (or form) and repeated glosses never appear twice; the order is seeded.
 */
function pickDistractors(
  pool: readonly ChallengePoolItem[],
  ownPos: string | undefined,
  answer: string,
  random: () => number,
  textOf: (item: ChallengePoolItem) => string,
): string[] {
  const seen = new Set([foldText(answer).trim()]);
  const candidates = pool.flatMap((item) => {
    const text = textOf(item);
    const key = foldText(text).trim();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ text, preferred: ownPos !== undefined && item.pos === ownPos }];
  });
  const preferred = candidates.filter((candidate) => candidate.preferred).map((candidate) => candidate.text);
  const others = candidates.filter((candidate) => !candidate.preferred).map((candidate) => candidate.text);
  return [...shuffled(preferred, random), ...shuffled(others, random)].slice(0, CHALLENGE_OPTIONS - 1);
}

function buildRecognize(
  word: string,
  content: CardContent,
  pool: readonly ChallengePoolItem[],
  random: () => number,
): RecognizeChallenge | undefined {
  const distractors = pickDistractors(pool, content.pos, content.gloss, random, (item) => item.gloss);
  if (!distractors.length) return undefined;
  const options = shuffled([content.gloss, ...distractors], random);
  return { kind: 'recognize', prompt: word, options, answerIndex: options.indexOf(content.gloss) };
}

function buildCloze(
  located: { example: string; position: ChallengePosition },
  choice: boolean,
  ownPos: string | undefined,
  pool: readonly ChallengePoolItem[],
  random: () => number,
): ClozeChallenge | undefined {
  const { example, position } = located;
  const blank = {
    kind: 'cloze' as const,
    before: example.slice(0, position.start),
    blank: position.text,
    after: example.slice(position.end),
    expected: position.text,
  };
  if (!choice) return blank;
  const distractors = pickDistractors(pool, ownPos, position.text, random, (item) => cleanHeadword(item.word));
  if (!distractors.length) return undefined;
  const options = shuffled([position.text, ...distractors], random);
  return { ...blank, options, answerIndex: options.indexOf(position.text) };
}

/**
 * One challenge for the card, or undefined when the card has too little content for any kind ("just flip"). The
 * ladder: the kind the state calls for, then the next easier one that has data (typed cloze, choice cloze, meaning).
 */
export function buildChallenge(input: {
  card: ChallengeCard;
  pool: readonly ChallengePoolItem[];
  seed: string;
  lang: GlossLanguage;
  voiceAvailable: boolean;
  formsOf?: (lemma: string) => ReadonlySet<string> | undefined;
}): Challenge | undefined {
  const content = cardContent(input.card, input.lang);
  const located = content.examples.flatMap((example) => {
    const position = findSurfaceForm(example, input.card.word, input.formsOf);
    return position ? [{ example, position }] : [];
  })[0];
  const random = seededRandom(input.seed);
  const kind = kindFor({
    schedule: input.card.schedule,
    clozeFound: located !== undefined,
    voiceAvailable: input.voiceAvailable,
  });
  const expected = cleanHeadword(input.card.word);
  if (kind === 'listen') return { kind, clue: content.gloss, expected };
  if (kind === 'produce') return { kind, clue: content.gloss, pos: content.pos, expected };
  if (kind === 'recognize') return buildRecognize(input.card.word, content, input.pool, random);
  // A card on a learning step picks the form among options; a young review types it.
  const choice = input.card.schedule?.phase === 'learning' || input.card.schedule?.phase === 'relearning';
  return (
    (located ? buildCloze(located, choice, content.pos, input.pool, random) : undefined) ??
    buildRecognize(input.card.word, content, input.pool, random)
  );
}

/** Case, spacing and apostrophes are not spelling; accents are, unless the learner turned strict accents off. */
const comparable = (text: string, strictAccents: boolean) => {
  const folded = foldText(text).replace(/\s+/g, ' ').trim();
  return strictAccents ? folded : folded.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Grades a typed answer (`produce`, `listen`, typed `cloze`); choice challenges are graded by index with
 * `gradeChoice`. `produce` ignores a leading article on either side, synonyms are not accepted.
 */
export function gradeTyped(
  challenge: ListenChallenge | ProduceChallenge | ClozeChallenge,
  typed: string,
  options: GradingOptions,
): ChallengeGrade {
  const comparableText = (text: string) => {
    const folded = comparable(text, options.strictAccents);
    return challenge.kind === 'produce' ? folded.replace(LEADING_ARTICLE, '') : folded;
  };
  return { correct: comparableText(typed) === comparableText(challenge.expected), expected: challenge.expected };
}

/** Grades a choice challenge by the selected option index; `expected` is the option the card wanted. */
export function gradeChoice(challenge: RecognizeChallenge | ClozeChoice, selected: number): ChallengeGrade {
  const answerIndex = challenge.answerIndex;
  return {
    correct: selected === answerIndex,
    expected: challenge.kind === 'recognize' ? challenge.options[answerIndex] : challenge.expected,
  };
}
