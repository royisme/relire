import type { ImageInput, JsonRequest, Lang } from '../types';
import { renderTemplate, type PromptVars } from './engine';
import { getPromptTemplate } from './store';
import type { PromptId } from './registry';
import { enumeratedReaderWords } from '../../../utils/readerTokens';
import { prosodySchema } from '../prosodySchema';
import type { GrammarTag } from '../../../types/grammar';
import type { ImportMode } from '../../../types/exercises';
import {
  drillsJsonSchema,
  exerciseJsonSchema,
  explanationJsonSchema,
  hintJsonSchema,
  importDraftJsonSchema,
  openGradeJsonSchema,
} from '../../exercises/jsonSchema';

/**
 * Builds provider-neutral requests from templates. This file only prepares the
 * variables (trimming, defaults); every word of wording lives in the templates.
 */

export { renderTemplate, usedVariables } from './engine';
export { PROMPTS, getPromptDefinition, type PromptId } from './registry';
export {
  getPromptOverrides,
  savePromptOverrides,
  getPromptTemplate,
  isPromptCustomized,
  subscribePromptChanges,
  type PromptOverrides,
} from './store';

export function render(id: PromptId, lang: Lang, vars: PromptVars): string {
  return renderTemplate(getPromptTemplate(id, lang), vars);
}

/** A short stable hash of the template in use, so cached answers made with an older prompt are not reused. */
export function promptFingerprint(id: PromptId, lang: Lang): string {
  const text = getPromptTemplate(id, lang);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const summary = (text?: string) => (text ? text.slice(0, 250) : '');

export function wordRequest(
  input: { word: string; sentenceContext?: string; articleContext?: string },
  lang: Lang,
): JsonRequest {
  return {
    prompt: render('word', lang, {
      word: input.word,
      sentence: input.sentenceContext || input.word,
      articleContext: summary(input.articleContext),
    }),
  };
}

export function prosodyRequest(input: { source: string; template?: string }, lang: Lang): JsonRequest {
  const enumerated = enumeratedReaderWords(input.source);
  const vars = {
    sentence: JSON.stringify(input.source),
    tokens: JSON.stringify(enumerated),
  };
  return {
    prompt: input.template === undefined ? render('prosody', lang, vars) : renderTemplate(input.template, vars),
    // Counts/ordinals come from the local enumeration and are validated locally.
    jsonSchema: prosodySchema,
  };
}

export function sentenceRequest(input: { sentence: string; articleContext?: string }, lang: Lang): JsonRequest {
  return {
    prompt: render('sentence', lang, { sentence: input.sentence, articleContext: summary(input.articleContext) }),
  };
}

export function drillsRequest(input: { articleText: string; type: string }, lang: Lang): JsonRequest {
  const type = ['syntax', 'cloze', 'oral'].includes(input.type) ? input.type : 'other';
  return { prompt: render('drills', lang, { articleText: input.articleText.slice(0, 1500), type }) };
}

export function pronunciationRequest(
  input: { referenceText: string; audio?: { mimeType: string; base64: string }; userTranscript?: string },
  lang: Lang,
): JsonRequest {
  const vars = {
    referenceText: input.referenceText,
    userTranscript: input.userTranscript ?? '',
    transcript: input.userTranscript || input.referenceText,
  };
  return input.audio
    ? { prompt: render('pronunciationAudio', lang, vars), audio: input.audio }
    : { prompt: render('pronunciationText', lang, vars) };
}

/* ----------------------------- exercise requests ----------------------------- */

/** The part of an article sent for exercise generation; the answerability check uses the same text. */
export const MAX_EXERCISE_ARTICLE = 8000;
export const exerciseArticleText = (articleText: string) => articleText.trim().slice(0, MAX_EXERCISE_ARTICLE);

export interface ExtractInput {
  mode: ImportMode;
  /** Pasted text; with images it travels as extra context. */
  text?: string;
  images?: ImageInput[];
  /** A title the learner suggested. */
  title?: string;
  signal?: AbortSignal;
}

export function extractRequest(input: ExtractInput, lang: Lang): JsonRequest {
  const images = input.images?.length ? input.images : undefined;
  return {
    prompt: render('extract', lang, {
      source: images ? 'image' : 'text',
      mode: input.mode,
      rawText: input.text?.trim(),
      customTitle: input.title?.trim(),
    }),
    jsonSchema: importDraftJsonSchema(),
    images,
    signal: input.signal,
    // The learner is shown which model reads their pages; it must be that one, once.
    singleAttempt: true,
  };
}

export interface ItemContext {
  prompt: string;
  userAnswer: string;
  grammarTag: string;
  /** Lesson text around the item, when there is some. */
  context?: string;
}

export function hintRequest(input: ItemContext & { exerciseType: string }, lang: Lang): JsonRequest {
  return {
    prompt: render('hint', lang, {
      exerciseType: input.exerciseType,
      prompt: input.prompt,
      userAnswer: input.userAnswer,
      grammarTag: input.grammarTag,
      context: input.context,
    }),
    jsonSchema: hintJsonSchema(),
  };
}

export function explainRequest(input: ItemContext & { expectedAnswer: string }, lang: Lang): JsonRequest {
  return {
    prompt: render('explain', lang, {
      prompt: input.prompt,
      userAnswer: input.userAnswer,
      expectedAnswer: input.expectedAnswer,
      grammarTag: input.grammarTag,
      context: input.context,
    }),
    jsonSchema: explanationJsonSchema(),
  };
}

export function gradeRequest(
  input: Omit<ItemContext, 'grammarTag'> & { expectedAnswer: string },
  lang: Lang,
): JsonRequest {
  return {
    prompt: render('grade', lang, {
      prompt: input.prompt,
      expectedAnswer: input.expectedAnswer,
      userAnswer: input.userAnswer,
      context: input.context,
    }),
    jsonSchema: openGradeJsonSchema(),
  };
}

/** How many recent mistakes the adaptive prompt shows; more adds cost without new patterns. */
const MAX_RECENT_MISTAKES = 10;

export interface AdaptiveInput {
  /** The weak grammar tags to practise. */
  targets: GrammarTag[];
  recentMistakes?: { prompt: string; userAnswer: string; expectedAnswer: string }[];
  count: number;
  level: string;
}

export function adaptiveRequest(input: AdaptiveInput, lang: Lang): JsonRequest {
  const mistakes = (input.recentMistakes ?? []).slice(0, MAX_RECENT_MISTAKES);
  return {
    prompt: render('adaptive', lang, {
      targetCategories: input.targets.join(', '),
      recentMistakes: mistakes.length ? JSON.stringify(mistakes) : undefined,
      count: String(input.count),
      level: input.level.trim(),
    }),
    jsonSchema: drillsJsonSchema(),
  };
}

export function exercisesRequest(
  input: { articleText: string; count: number; level: string },
  lang: Lang,
): JsonRequest {
  return {
    prompt: render('exercises', lang, {
      level: input.level.trim(),
      articleText: exerciseArticleText(input.articleText),
      count: String(input.count),
    }),
    jsonSchema: exerciseJsonSchema(),
  };
}
