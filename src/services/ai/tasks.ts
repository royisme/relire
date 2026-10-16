import type { PracticeDeck, PronunciationAssessment, SentenceAnalysis, WordAnalysis } from '../../types';
import {
  DrillsSchema,
  ExplanationSchema,
  GeneratedExercisesSchema,
  HintSchema,
  OpenGradeSchema,
  type Drills,
  type Explanation,
  type GeneratedExercises,
  type Hint,
  type OpenGrade,
} from '../../types/exerciseAi';
import { parseImportDraft, type ImportDraft } from '../exercises/importDraft';
import { unsupportedQuotes } from '../exercises/answerability';
import {
  adaptiveRequest,
  drillsRequest,
  exerciseArticleText,
  exercisesRequest,
  explainRequest,
  extractRequest,
  gradeRequest,
  hintRequest,
  pronunciationRequest,
  prosodyRequest,
  sentenceRequest,
  wordRequest,
  type AdaptiveInput,
  type ExtractInput,
  type ItemContext,
} from './prompts';
import { ImageInputUnsupportedError, InvalidAnswerError } from './errors';
import { guardAnswer, parseAnswer } from './validate';
import type { Lang, TextConfig, TextProvider } from './types';
import { parseProsodyResponse } from '../../utils/prosodyResponse';

/**
 * What the app asks the AI to do. Each task is a prompt (prompts/) sent through
 * whichever text provider the user picked; nothing here knows about Gemini.
 * Exercise tasks send the JSON schema of their contract and parse the answer
 * with the same Zod schema; a failure throws with the real reason, never a
 * substitute answer.
 */

export interface TextContext {
  provider: TextProvider;
  config: TextConfig;
  lang: Lang;
}

export async function annotatePronunciation(input: Parameters<typeof prosodyRequest>[0], ctx: TextContext) {
  const value = await ctx.provider.generateJson<unknown>(prosodyRequest(input, ctx.lang), ctx.config);
  return parseProsodyResponse(value, input.source);
}

export const analyzeWord = (input: Parameters<typeof wordRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<WordAnalysis>(wordRequest(input, ctx.lang), ctx.config);

export const analyzeSentence = (input: Parameters<typeof sentenceRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<SentenceAnalysis>(sentenceRequest(input, ctx.lang), ctx.config);

export const generateDrills = (input: Parameters<typeof drillsRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<PracticeDeck>(drillsRequest(input, ctx.lang), ctx.config);

export const assessPronunciation = (input: Parameters<typeof pronunciationRequest>[0], ctx: TextContext) =>
  ctx.provider.generateJson<PronunciationAssessment>(
    // A provider that cannot listen is scored on the transcript alone.
    pronunciationRequest({ ...input, audio: ctx.provider.supportsAudioInput ? input.audio : undefined }, ctx.lang),
    ctx.config,
  );

/* ------------------------------ exercise tasks ------------------------------ */

/** Pages of one worksheet that can be read in a single request. */
export const MAX_EXTRACT_IMAGES = 3;
/** Pasted text longer than this cannot be copied back whole (the draft's `sourceText` is capped). */
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

/**
 * Reads pasted text or 1-3 page images into a validated import draft. Refuses
 * before any request when the model cannot read images. One attempt on the
 * chosen model; `input.signal` cancels it.
 */
export async function extractMaterial(input: ExtractInput, ctx: TextContext): Promise<ImportDraft> {
  const images = input.images ?? [];
  const text = input.text?.trim() ?? '';
  if (!images.length && !text) throw new Error('There is nothing to read: add text or one to three images.');
  if (images.length > MAX_EXTRACT_IMAGES)
    throw new RangeError(`At most ${MAX_EXTRACT_IMAGES} images can be read at once.`);
  if (images.some((image) => !image.data || !image.mimeType.startsWith('image/')))
    throw new Error('Every image needs base64 data and an image type.');
  if (text.length > MAX_EXTRACT_TEXT)
    throw new RangeError(`The text is longer than ${MAX_EXTRACT_TEXT} characters; import it in parts.`);
  if (images.length && !ctx.provider.supportsImageInput(ctx.config.model))
    throw new ImageInputUnsupportedError(ctx.config.model);

  const value = await ctx.provider.generateJson<unknown>(extractRequest(input, ctx.lang), ctx.config);
  return guardAnswer('the material', () => parseImportDraft(value, input.mode));
}

/** A hint that points at the rule without giving the answer away. */
export async function hint(input: ItemContext & { exerciseType: string }, ctx: TextContext): Promise<Hint> {
  const value = await ctx.provider.generateJson<unknown>(hintRequest(input, ctx.lang), ctx.config);
  return parseAnswer('the hint', HintSchema, value);
}

/** The rule behind the expected answer and where the learner's answer went wrong. */
export async function explainMistake(
  input: ItemContext & { expectedAnswer: string },
  ctx: TextContext,
): Promise<Explanation> {
  const value = await ctx.provider.generateJson<unknown>(explainRequest(input, ctx.lang), ctx.config);
  return parseAnswer('the explanation', ExplanationSchema, value);
}

/** Judges an open answer that matched no reference. The verdict is an estimate; it carries no score. */
export async function gradeOpenAnswer(
  input: Omit<ItemContext, 'grammarTag'> & { expectedAnswer: string },
  ctx: TextContext,
): Promise<OpenGrade> {
  const value = await ctx.provider.generateJson<unknown>(gradeRequest(input, ctx.lang), ctx.config);
  return parseAnswer('the grade', OpenGradeSchema, value);
}

/** New items for the grammar tags a learner keeps getting wrong. */
export async function generateAdaptiveDrills(input: AdaptiveInput, ctx: TextContext): Promise<Drills> {
  if (!input.targets.length) throw new Error('Pick at least one grammar area to practise.');
  checkCount(input.count);
  checkLevel(input.level);
  const value = await ctx.provider.generateJson<unknown>(adaptiveRequest(input, ctx.lang), ctx.config);
  return parseAnswer('the drills', DrillsSchema, value);
}

/**
 * Exercise units made from an article. Beyond the schema, every item that
 * quotes the article must quote words that are really in it: a quote that is
 * not there means the item cannot be answered from the article.
 */
export async function generateExercises(
  input: { articleText: string; count: number; level: string },
  ctx: TextContext,
): Promise<GeneratedExercises> {
  checkCount(input.count);
  checkLevel(input.level);
  const article = exerciseArticleText(input.articleText);
  if (!article) throw new Error('The article is empty.');

  const value = await ctx.provider.generateJson<unknown>(exercisesRequest(input, ctx.lang), ctx.config);
  const exercises = parseAnswer('the exercises', GeneratedExercisesSchema, value);
  const missing = unsupportedQuotes(exercises.units, article);
  if (missing.length)
    throw new InvalidAnswerError(
      'the exercises',
      missing.map((m) => `item ${m.itemId} of unit ${m.unitId} quotes words that are not in the article: "${m.quote}"`),
    );
  return exercises;
}
