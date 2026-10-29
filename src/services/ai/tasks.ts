import { ConjugationAnswerSchema, foldAnswerApostrophes, type ConjugationAnswer } from '../../types/conjugationAnswer';
import type { AtelierItem, AtelierLevel } from '../../types/atelier';
import type { PronunciationAssessment, SentenceAnalysis, WordAnalysis } from '../../types';
import { GRAMMAR_TAGS } from '../../types/grammar';
import i18n from '../../i18n';
import {
  DrillsSchema,
  ExplanationSchema,
  GeneratedExercisesSchema,
  validateGeneratedArea,
  HintSchema,
  OpenGradeSchema,
  type Drills,
  type Explanation,
  type GeneratedSet,
  type Hint,
  type OpenGrade,
} from '../../types/exerciseAi';
import { parseImportDraft, type ImportDraft } from '../exercises/importDraft';
import { keepAnswerable } from '../exercises/answerability';
import { joinBricks } from '../atelier/join';
import { parseRound, type ParsedRound } from '../atelier/parse';
import type { RoundSpec } from '../atelier/spec';
import {
  adaptiveRequest,
  atelierGradeRequest,
  atelierRequest,
  conjugateRequest,
  exerciseArticleText,
  exercisesRequest,
  explainRequest,
  extractRequest,
  gradeRequest,
  hintRequest,
  pronunciationRequest,
  prosodyRequest,
  sentenceRequest,
  transcribeRequest,
  wordRequest,
  type AdaptiveInput,
  type ExtractInput,
  type ItemContext,
  type TranscribeInput,
} from './prompts';
import { ImageInputUnsupportedError, InvalidAnswerError } from './errors';
import { guardAnswer, parseAnswer } from './validate';
import type { Lang, TextExecution } from './types';
import { TranscriptionSchema, type Transcription } from '../../types/transcription';
import type { ImageInput } from './types';
import { ArticleExerciseAreaSchema, type ArticleExerciseArea } from '../../types/learningArea';
import { parseProsodyResponse } from '../../utils/prosodyResponse';

/**
 * What the app asks the AI to do. Each task is a prompt (prompts/) sent through
 * whichever text provider the user picked; nothing here knows about Gemini.
 * Exercise tasks send the JSON schema of their contract and parse the answer
 * with the same Zod schema; a failure throws with the real reason, never a
 * substitute answer.
 */

export interface TextContext {
  execution: TextExecution;
  lang: Lang;
}

export async function annotatePronunciation(input: Parameters<typeof prosodyRequest>[0], ctx: TextContext) {
  const value = await ctx.execution.generateJson<unknown>(prosodyRequest(input, ctx.lang));
  return parseProsodyResponse(value, input.source);
}

export const analyzeWord = (input: Parameters<typeof wordRequest>[0], ctx: TextContext) =>
  ctx.execution.generateJson<WordAnalysis>(wordRequest(input, ctx.lang));

export const analyzeSentence = (input: Parameters<typeof sentenceRequest>[0], ctx: TextContext) =>
  ctx.execution.generateJson<SentenceAnalysis>(sentenceRequest(input, ctx.lang));

export async function assessPronunciation(
  input: Parameters<typeof pronunciationRequest>[0],
  ctx: TextContext,
): Promise<PronunciationAssessment> {
  // A provider that cannot listen is scored on the learner's own transcript alone.
  const audio = ctx.execution.supportsAudioInput ? input.audio : undefined;
  // With no audio and no words the reference text would be scored as if it had been read aloud.
  if (!audio && !input.userTranscript?.trim()) throw new Error(i18n.t('errors.noSpeechToScore'));
  return ctx.execution.generateJson<PronunciationAssessment>(pronunciationRequest({ ...input, audio }, ctx.lang));
}

/* ------------------------------ exercise tasks ------------------------------ */

/** Pages of one worksheet that can be read in a single request. */
export const MAX_EXTRACT_IMAGES = 5;
/** Longest pasted text one extraction request carries. */
export const MAX_EXTRACT_TEXT = 40000;
/** Items one generation request may ask for. */
export const MAX_GENERATED_ITEMS = 20;

function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_GENERATED_ITEMS)
    throw new RangeError(`The number of items must be a whole number from 1 to ${MAX_GENERATED_ITEMS}.`);
}

function checkLevel(level: string) {
  if (!level.trim()) throw new Error('A CEFR level is required.');
}

function checkImages(images: ImageInput[]) {
  if (images.length > MAX_EXTRACT_IMAGES)
    throw new RangeError(i18n.t('importMaterial.requestImageLimit', { limit: MAX_EXTRACT_IMAGES }));
  if (images.some((image) => !image.data || !image.mimeType.startsWith('image/')))
    throw new Error('Every image needs base64 data and an image type.');
}

/**
 * Reads pasted text or 1-5 page images into a validated import draft. Refuses
 * before any request when the model cannot read images. One attempt on the
 * chosen model; `input.signal` cancels it.
 */
export async function extractMaterial(input: ExtractInput, ctx: TextContext): Promise<ImportDraft> {
  const images = input.images ?? [];
  const text = input.text?.trim() ?? '';
  if (!images.length && !text) throw new Error(i18n.t('importMaterial.nothingToRead'));
  checkImages(images);
  if (text.length > MAX_EXTRACT_TEXT)
    throw new RangeError(`The text is longer than ${MAX_EXTRACT_TEXT} characters; import it in parts.`);
  if (images.length && ctx.execution.imageInput === 'unsupported')
    throw new ImageInputUnsupportedError(ctx.execution.model);

  const value = await ctx.execution.generateJson<unknown>(extractRequest(input, ctx.lang));
  return guardAnswer('the material', () => parseImportDraft(value, input.mode));
}

/**
 * Reads 1-5 page images into one article: a title (empty when the pages have
 * none) and the text. Refuses before any request when the model cannot read
 * images. One attempt on the chosen model; `input.signal` cancels it.
 */
export async function transcribeMaterial(input: TranscribeInput, ctx: TextContext): Promise<Transcription> {
  if (!input.images.length) throw new Error(i18n.t('importMaterial.nothingToRead'));
  checkImages(input.images);
  if (ctx.execution.imageInput === 'unsupported') throw new ImageInputUnsupportedError(ctx.execution.model);

  const value = await ctx.execution.generateJson<unknown>(transcribeRequest(input, ctx.lang));
  return parseAnswer('the transcription', TranscriptionSchema, value);
}

/** A hint that points at the rule without giving the answer away. */
export async function hint(input: ItemContext & { exerciseType: string }, ctx: TextContext): Promise<Hint> {
  const value = await ctx.execution.generateJson<unknown>(hintRequest(input, ctx.lang));
  return parseAnswer('the hint', HintSchema, value);
}

/** The rule behind the expected answer and where the learner's answer went wrong. */
export async function explainMistake(
  input: ItemContext & { expectedAnswer: string },
  ctx: TextContext,
): Promise<Explanation> {
  const value = await ctx.execution.generateJson<unknown>(explainRequest(input, ctx.lang));
  return parseAnswer('the explanation', ExplanationSchema, value);
}

/** Judges an open answer that matched no reference. The verdict is an estimate; it carries no score. */
export async function gradeOpenAnswer(
  input: Omit<ItemContext, 'grammarTag'> & { expectedAnswer: string },
  ctx: TextContext,
): Promise<OpenGrade> {
  const value = await ctx.execution.generateJson<unknown>(gradeRequest(input, ctx.lang));
  return parseAnswer('the grade', OpenGradeSchema, value);
}

/** New items for the grammar tags a learner keeps getting wrong. */
export async function generateAdaptiveDrills(input: AdaptiveInput, ctx: TextContext): Promise<Drills> {
  if (!input.targets.length) throw new Error('Pick at least one grammar area to practise.');
  checkCount(input.count);
  checkLevel(input.level);
  const value = await ctx.execution.generateJson<unknown>(adaptiveRequest(input, ctx.lang));
  return parseAnswer('the drills', DrillsSchema, value);
}

/**
 * Exercise units made from an article. Beyond the schema, every item that
 * quotes the article must quote words that are really in it: an item whose
 * quote is not there cannot be answered from the article and is left out, with
 * the rest kept. Only when nothing is left does the call fail.
 */
export async function generateExercises(
  input: { articleText: string; count: number; level: string; learningArea: ArticleExerciseArea },
  ctx: TextContext,
): Promise<GeneratedSet> {
  checkCount(input.count);
  checkLevel(input.level);
  ArticleExerciseAreaSchema.parse(input.learningArea);
  const article = exerciseArticleText(input.articleText);
  if (!article) throw new Error('The article is empty.');

  const value = await ctx.execution.generateJson<unknown>(exercisesRequest(input, ctx.lang));
  const exercises = parseAnswer('the exercises', GeneratedExercisesSchema, value);
  validateGeneratedArea(exercises, input.learningArea);
  const { units, dropped, missing } = keepAnswerable(exercises.units, article);
  if (!units.length)
    throw new InvalidAnswerError(
      'the exercises',
      missing.map((m) => `item ${m.itemId} of unit ${m.unitId} quotes words that are not in the article: "${m.quote}"`),
    );
  return { units, dropped };
}

/** The simple tenses, participles and examples of one verb, in the structure of `ConjugationAnswerSchema`. */
export async function conjugateVerb(input: { infinitive: string }, ctx: TextContext): Promise<ConjugationAnswer> {
  const value = await ctx.execution.generateJson<unknown>(conjugateRequest(input, ctx.lang));
  return parseAnswer('the conjugation', ConjugationAnswerSchema, foldAnswerApostrophes(value));
}

/* ------------------------------- atelier tasks ------------------------------- */

/** Items one atelier round may ask for; five is the game's default. */
export const MAX_ATELIER_ITEMS = 10;

/** One round of sentence-brick items; dropped items are counted, not fatal, until none is left. */
export async function generateAtelierRound(
  input: { spec: RoundSpec; level: AtelierLevel; count: number },
  ctx: TextContext,
): Promise<ParsedRound> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_ATELIER_ITEMS)
    throw new RangeError(`The number of items must be a whole number from 1 to ${MAX_ATELIER_ITEMS}.`);

  const { spec } = input;
  const value = await ctx.execution.generateJson<unknown>(
    atelierRequest(
      {
        themeFr: spec.theme.fr,
        subtopicFr: spec.subtopic.fr,
        scope: spec.subtopic.scope,
        taskId: spec.taskId,
        exampleFr: spec.example.fr,
        level: input.level,
        count: input.count,
        grammarTags: GRAMMAR_TAGS.join(', '),
      },
      ctx.lang,
    ),
  );
  const round = parseRound(value);
  if (!round.items.length)
    throw new InvalidAnswerError(
      'the round',
      round.dropped.map((drop) => `item ${drop.index} was dropped: ${drop.reason}`),
    );
  return round;
}

/** Judges a brick arrangement that matched neither the reference nor a variant. */
export async function gradeAtelierBuild(
  input: { item: AtelierItem; userAnswer: string },
  ctx: TextContext,
): Promise<OpenGrade> {
  const value = await ctx.execution.generateJson<unknown>(
    atelierGradeRequest(
      {
        item: JSON.stringify(input.item),
        userAnswer: input.userAnswer,
        expectedAnswer: joinBricks(input.item.bricks),
      },
      ctx.lang,
    ),
  );
  return parseAnswer('the grade', OpenGradeSchema, value);
}
