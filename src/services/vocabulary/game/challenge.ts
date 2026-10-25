/**
 * Owns the game's one retrieval challenge per card: the kind read from the card's real state, the seeded options, the
 * surface-form finder and answer grading. Pure: no UI, i18n, storage, AI or review write; the challenge informs the
 * learner and never touches the schedule. Typed answers compare through `normalizeFrench`, the practice accent policy.
 */
import type { VocabularyBookSource, VocabularyRow, VocabularySchedule } from '../../../types/vocabulary';
import { normalizeFrench } from '../../exercises/normalizeFrench';

export type ChallengeKind = 'recognize' | 'cloze' | 'listen' | 'produce';
export type GlossLanguage = 'en' | 'zh';

/** A card in `review` at or above this many scheduled days is mature (Anki's convention, the plan's fork 2). */
export const MATURE_DAYS = 21;
/** Options of a choice challenge: the answer plus at most three distractors, so two distractors leave three options. */
export const CHALLENGE_OPTIONS = 4;
/** Simple endings tried after cleaning a one-word headword; the lead measured these tiers on the real book. */
const SIMPLE_ENDINGS = ['', 'e', 's', 'es', 'x', 'é', 'ée', 'ées', 'és'];
const LEADING_ARTICLE = /^(?:le|la|les|un|une|des)\s+|^l['’]/;

/**
 * The found form as it appears in the sentence. `start`, `end` and `text` index `sentence`, the NFC copy of the
 * searched sentence: a personal sentence may arrive decomposed, so a caller slices `sentence`, never its own copy.
 */
export interface ChallengePosition {
  start: number;
  end: number;
  text: string;
  sentence: string;
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
  /** The entry's gloss per app language; an entry without the challenge's language is never an option. */
  gloss: { en?: string; zh?: string };
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
  /** The surface form as it appears in the sentence: what a typed answer has to match. */
  expected: string;
  /** Present when the learner picks the headword among options instead of typing the sentence's form. */
  options?: string[];
  answerIndex?: number;
}

/** A cloze challenge that offers the headword among options, so the learner's pick is graded by index. */
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
 * The headword as the book writes it, reduced to the lemma a sentence or the lexicon can match, keeping its own
 * case: without parenthesised parts (`abattre ( s’)`), the placeholders `qqn`/`qqch`, a feminine marker after a
 * comma (`abstrait ,e`) and trailing punctuation.
 */
export function cleanHeadword(word: string): string {
  return word
    .normalize('NFC')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:qqn|qqch|qch|qn)\b\.?/g, ' ')
    .replace(/\s*,\s*(?:e|ne|ère|euse|ve|ale|elle|ette|ienne|rice)\b/g, '')
    .replace(/[?!.,;:…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Where the headword appears in one sentence, or undefined. Tiers in order: the folded headword itself; a known form
 * of it from `formsOf`; the cleaned headword plus a simple ending or, when it has several words, as a bounded
 * substring. Elision is respected: in `L’eau est froide` the token `eau` is the surface form, so a blank covers `eau`
 * only, while a plain token next to a hyphen (`grand` in `grand-mère`) is a different word. `formsOf` receives the
 * cleaned headword, the key the lexicon uses.
 */
export function findSurfaceForm(
  sentence: string,
  headword: string,
  formsOf?: (lemma: string) => ReadonlySet<string> | undefined,
): ChallengePosition | undefined {
  const nfc = sentence.normalize('NFC');
  // Folding (lowercase, curly to straight apostrophe) is length-preserving on the NFC copy, so offsets transfer.
  const folded = foldText(nfc);
  const spans = [...folded.matchAll(/[\p{L}\p{M}]+/gu)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
    sentence: nfc,
  }));
  const surface = (span: ChallengePosition): ChallengePosition => ({
    ...span,
    text: span.sentence.slice(span.start, span.end),
  });
  // A hyphen belongs to a headword that carries one, so such a want is matched as a bounded substring, like a
  // multi-word want; a want with no hyphen of its own must not touch a neighbour's (`grand` inside `grand-mère`).
  const substring = (want: string): ChallengePosition | undefined => {
    for (let at = folded.indexOf(want); at >= 0; at = folded.indexOf(want, at + 1)) {
      const before = folded[at - 1] ?? '';
      const after = folded[at + want.length] ?? '';
      if (!/[\p{L}\p{M}]/u.test(before) && !/[\p{L}\p{M}]/u.test(after))
        return { start: at, end: at + want.length, text: want, sentence: nfc };
    }
    return undefined;
  };
  const token = (want: string): ChallengePosition | undefined =>
    spans.find((span) => span.text === want && folded[span.start - 1] !== '-' && folded[span.end] !== '-');
  const occurrence = (want: string): ChallengePosition | undefined =>
    /\s/.test(want) || want.includes('-') ? substring(want) : token(want);
  const exact = occurrence(foldText(headword).trim());
  if (exact) return surface(exact);
  const forms = [...(formsOf?.(foldText(cleanHeadword(headword))) ?? [])]
    .map((form) => occurrence(foldText(form).trim()))
    .filter((span): span is ChallengePosition => span !== undefined)
    .sort((left, right) => left.start - right.start);
  if (forms[0]) return surface(forms[0]);
  const cleaned = foldText(cleanHeadword(headword));
  const cleanedSpans =
    /\s/.test(cleaned) || cleaned.includes('-')
      ? [substring(cleaned)]
      : spans.filter(
          (span) =>
            SIMPLE_ENDINGS.some((ending) => span.text === cleaned + ending) &&
            folded[span.start - 1] !== '-' &&
            folded[span.end] !== '-',
        );
  return cleanedSpans[0] ? surface(cleanedSpans[0]) : undefined;
}

/**
 * The kind the card's real state calls for, before the pool is known: a new card asks for the meaning, a learning
 * card fills a blank among options, a young review types the blank or produces the word, a mature card is heard.
 */
export function kindFor(state: ChallengeState): ChallengeKind {
  const schedule = state.schedule;
  if (!schedule || schedule.phase === 'new') return 'recognize';
  if (schedule.phase !== 'review') return state.clozeFound ? 'cloze' : 'recognize';
  if (schedule.scheduledDays >= MATURE_DAYS) return state.voiceAvailable ? 'listen' : 'produce';
  return state.clozeFound ? 'cloze' : 'produce';
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

/**
 * The card's first sense in the app language, or a personal word's first context. The two languages are never mixed:
 * a card without a gloss in the requested language (an AI analysis without `translationEn`, say) gets an empty one,
 * so the choice kinds skip it. `pos` is only ever a hint.
 */
function cardContent(card: ChallengeCard, lang: GlossLanguage): CardContent {
  const sense = card.bookSource?.senses[0];
  const definition = card.contexts[0]?.definition;
  let contextGloss = '';
  let contextPos: string | undefined;
  if (definition?.kind === 'ai') {
    contextGloss = lang === 'en' ? (definition.analysis.translationEn ?? '') : definition.analysis.translation;
    contextPos = definition.analysis.partOfSpeech.trim() || undefined;
  } else if (definition) {
    contextGloss = definition.entry.gloss[lang];
    contextPos = definition.entry.pos;
  }
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
 * Up to three option texts for a choice challenge. Never an option: the card's own word under any gloss, an entry
 * without the app language, an entry whose gloss equals the card's (the answer itself, or a synonym of it), or a
 * text already chosen. Same part of speech first when both sides name one; the order is seeded.
 */
function pickDistractors(
  pool: readonly ChallengePoolItem[],
  lang: GlossLanguage,
  own: { word: string; gloss: string; pos?: string },
  answer: string,
  random: () => number,
  textOf: (item: ChallengePoolItem) => string,
): string[] {
  const ownWord = foldText(cleanHeadword(own.word));
  const ownGloss = foldText(own.gloss).trim();
  const seen = new Set([foldText(answer).trim()]);
  const candidates = pool.flatMap((item) => {
    const gloss = item.gloss[lang];
    if (!gloss || foldText(cleanHeadword(item.word)) === ownWord) return [];
    const text = textOf(item);
    const key = foldText(text).trim();
    if (seen.has(key) || foldText(gloss).trim() === ownGloss) return [];
    seen.add(key);
    return [{ text, preferred: own.pos !== undefined && item.pos === own.pos }];
  });
  const preferred = candidates.filter((candidate) => candidate.preferred).map((candidate) => candidate.text);
  const others = candidates.filter((candidate) => !candidate.preferred).map((candidate) => candidate.text);
  return [...shuffled(preferred, random), ...shuffled(others, random)].slice(0, CHALLENGE_OPTIONS - 1);
}

function buildRecognize(
  word: string,
  content: CardContent,
  pool: readonly ChallengePoolItem[],
  lang: GlossLanguage,
  random: () => number,
): RecognizeChallenge | undefined {
  if (!content.gloss) return undefined;
  const distractors = pickDistractors(
    pool,
    lang,
    { word, gloss: content.gloss, pos: content.pos },
    content.gloss,
    random,
    (item) => item.gloss[lang] ?? '',
  );
  if (!distractors.length) return undefined;
  const options = shuffled([content.gloss, ...distractors], random);
  return { kind: 'recognize', prompt: word, options, answerIndex: options.indexOf(content.gloss) };
}

/**
 * One challenge for the card, or undefined when the card has too little content for any kind ("just flip"). The
 * ladder runs from the kind the state calls for down to the next easier one that has data, easiest last: a typed
 * cloze needs only the sentence's surface form; the choice cloze also needs the app-language gloss and one
 * distractor, and falls to the meaning; `listen` and `produce` need that gloss too and fall to the meaning without
 * it; the meaning without a gloss or a distractor is undefined. With two distractors the options are three, with
 * one they are two.
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
  const located = content.examples
    .flatMap((example) => {
      const position = findSurfaceForm(example, input.card.word, input.formsOf);
      return position ? [{ example: position.sentence, position }] : [];
    })
    .at(0);
  const random = seededRandom(input.seed);
  const kind = kindFor({
    schedule: input.card.schedule,
    clozeFound: located !== undefined,
    voiceAvailable: input.voiceAvailable,
  });
  const meaning = () => buildRecognize(input.card.word, content, input.pool, input.lang, random);
  if (kind === 'recognize') return meaning();
  if (kind === 'listen' || kind === 'produce') {
    if (!content.gloss) return meaning();
    return kind === 'listen'
      ? { kind, clue: content.gloss, expected: cleanHeadword(input.card.word) }
      : { kind, clue: content.gloss, pos: content.pos, expected: cleanHeadword(input.card.word) };
  }
  if (!located) return meaning();
  const { example, position } = located;
  const blank: ClozeChallenge = {
    kind: 'cloze',
    before: example.slice(0, position.start),
    blank: position.text,
    after: example.slice(position.end),
    expected: position.text,
  };
  // A card on a learning step picks the headword among options; a young review types the sentence's form.
  const choice = input.card.schedule?.phase === 'learning' || input.card.schedule?.phase === 'relearning';
  if (!choice) return blank;
  // The choice is a choice of the headword: the sentence's own form (inflected, maybe capitalised) would give the
  // answer away among headwords, so every option is a cleaned headword. Keeping synonyms out needs the card's own
  // gloss in the app language, so without it the card falls to the meaning.
  if (!content.gloss) return meaning();
  const answer = cleanHeadword(input.card.word);
  const distractors = pickDistractors(
    input.pool,
    input.lang,
    { word: input.card.word, gloss: content.gloss, pos: content.pos },
    answer,
    random,
    (item) => cleanHeadword(item.word),
  );
  if (!distractors.length) return meaning();
  const options = shuffled([answer, ...distractors], random);
  return { ...blank, options, answerIndex: options.indexOf(answer) };
}

/**
 * Grades a typed answer (`produce`, `listen`, typed `cloze`); choice challenges are graded by index with
 * `gradeChoice`. The comparison goes through `normalizeFrench` (the practice accent policy) after headword cleaning,
 * so the raw headword (`aborder qqn`) and its lemma (`aborder`) are both accepted. `produce` ignores a leading
 * article on either side, but only for a noun; synonyms are not accepted.
 */
export function gradeTyped(
  challenge: ListenChallenge | ProduceChallenge | ClozeChallenge,
  typed: string,
  options: GradingOptions,
): ChallengeGrade {
  const noun = challenge.kind === 'produce' && (challenge.pos?.startsWith('n.') ?? false);
  const comparableText = (text: string) => {
    const normalized = normalizeFrench(cleanHeadword(text), options.strictAccents);
    return noun ? normalized.replace(LEADING_ARTICLE, '').trim() : normalized;
  };
  return { correct: comparableText(typed) === comparableText(challenge.expected), expected: challenge.expected };
}

/** Grades a choice challenge by the selected option index; `expected` is the option the card wanted. */
export function gradeChoice(challenge: RecognizeChallenge | ClozeChoice, selected: number): ChallengeGrade {
  return { correct: selected === challenge.answerIndex, expected: challenge.options[challenge.answerIndex] };
}
