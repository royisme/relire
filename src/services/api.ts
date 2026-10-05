import { WordAnalysis, SentenceAnalysis, PronunciationAssessment, PracticeDeck } from '../types';
import { getApiKey, getAppSettings } from '../utils/appSettings';
import i18n from '../i18n';
import * as ai from './ai/tasks';
import { getTextProvider } from './ai/providers';
import { promptFingerprint } from './ai/prompts';
import type { Lang } from './ai/types';
import { cachedRequest } from './cachedRequest';
import { drillsKey, sentenceKey, wordKey } from '../storage/cache';

/**
 * What the UI calls: reads the user's settings and language, decides what is
 * cached and under which key, and delegates the request to the AI layer.
 * Cache keys carry a fingerprint of the prompt but deliberately ignore the
 * provider, model and article context, so switching models or meeting the same
 * sentence in another article never re-spends tokens.
 */

export { MissingApiKeyError } from './ai/errors';

function context(): ai.TextContext & { lang: Lang } {
  const settings = getAppSettings();
  return {
    provider: getTextProvider(settings.textProvider),
    config: { apiKey: getApiKey(settings, settings.textProvider), model: settings.textModel },
    lang: i18n.language === 'zh' ? 'zh' : 'en',
  };
}

export function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string
): Promise<WordAnalysis> {
  const ctx = context();
  return cachedRequest('word', wordKey(ctx.lang, promptFingerprint('word', ctx.lang), word, sentenceContext), () =>
    ai.analyzeWord({ word, sentenceContext, articleContext }, ctx)
  );
}

export function fetchSentenceAnalysis(sentence: string, articleContext?: string): Promise<SentenceAnalysis> {
  const ctx = context();
  return cachedRequest('sentence', sentenceKey(ctx.lang, promptFingerprint('sentence', ctx.lang), sentence), () =>
    ai.analyzeSentence({ sentence, articleContext }, ctx)
  );
}

/** Not cached: every recording is different. */
export function assessPronunciation(params: {
  referenceText: string;
  audioBase64?: string;
  mimeType?: string;
  userTranscript?: string;
}): Promise<PronunciationAssessment> {
  const { audioBase64, mimeType, ...rest } = params;
  return ai.assessPronunciation(
    { ...rest, audio: audioBase64 ? { base64: audioBase64, mimeType: mimeType || 'audio/webm' } : undefined },
    context()
  );
}

/** Drills are kept per article and type; `fresh` asks for a new set and replaces the saved one. */
export function generatePracticeDrills(
  articleText: string,
  type: string = 'syntax',
  fresh = false
): Promise<PracticeDeck> {
  const ctx = context();
  return cachedRequest(
    'drills',
    drillsKey(ctx.lang, promptFingerprint('drills', ctx.lang), type, articleText),
    () => ai.generateDrills({ articleText, type }, ctx),
    fresh
  );
}

/** Checks a pasted key against the text provider before it is saved. */
export function checkTextKey(apiKey: string): Promise<void> {
  const settings = getAppSettings();
  return getTextProvider(settings.textProvider).checkKey({ apiKey, model: settings.textModel });
}
