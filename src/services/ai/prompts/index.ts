import type { JsonRequest, Lang } from '../types';
import { renderTemplate, type PromptVars } from './engine';
import { getPromptTemplate } from './store';
import type { PromptId } from './registry';

/**
 * Builds provider-neutral requests from templates. This file only prepares the
 * variables (trimming, defaults); every word of wording lives in the templates.
 */

export { renderTemplate, usedVariables } from './engine';
export { PROMPTS, getPromptDefinition, type PromptId } from './registry';
export { getPromptOverrides, savePromptOverrides, getPromptTemplate, isPromptCustomized, type PromptOverrides } from './store';

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

export function wordRequest(input: { word: string; sentenceContext?: string; articleContext?: string }, lang: Lang): JsonRequest {
  return {
    prompt: render('word', lang, {
      word: input.word,
      sentence: input.sentenceContext || input.word,
      articleContext: summary(input.articleContext),
    }),
  };
}

export function sentenceRequest(input: { sentence: string; articleContext?: string }, lang: Lang): JsonRequest {
  return { prompt: render('sentence', lang, { sentence: input.sentence, articleContext: summary(input.articleContext) }) };
}

export function drillsRequest(input: { articleText: string; type: string }, lang: Lang): JsonRequest {
  const type = ['syntax', 'cloze', 'oral'].includes(input.type) ? input.type : 'other';
  return { prompt: render('drills', lang, { articleText: input.articleText.slice(0, 1500), type }) };
}

export function pronunciationRequest(
  input: { referenceText: string; audio?: { mimeType: string; base64: string }; userTranscript?: string },
  lang: Lang
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
