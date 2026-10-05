import { WordAnalysis, SentenceAnalysis, PronunciationAssessment, PracticeDeck } from '../types';
import { getAppSettings } from '../utils/appSettings';
import i18n from '../i18n';
import * as gemini from './gemini';
import { drillsKey, getCached, putCached, sentenceKey, wordKey, type CacheKind } from '../storage/cache';

export { MissingApiKeyError } from './gemini';

function options(): gemini.GeminiOptions {
  const settings = getAppSettings();
  return {
    apiKey: settings.customApiKey,
    model: settings.analysisModel,
    lang: i18n.language === 'zh' ? 'zh' : 'en',
  };
}

// Requests currently in flight, so two quick taps on the same word cost one call.
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Looks in the persistent cache first and only then asks Gemini, so a repeated
 * word or sentence costs nothing (and cached answers work without a key).
 */
async function cached<T>(kind: CacheKind, key: string, fetchFresh: () => Promise<T>, skipCache = false): Promise<T> {
  const hit = skipCache ? undefined : await getCached<T>(kind, key);
  if (hit) return hit;

  const flightKey = `${kind}:${key}`;
  const pending = inFlight.get(flightKey) as Promise<T> | undefined;
  if (pending) return pending;

  const request = fetchFresh()
    .then(async (value) => {
      await putCached(kind, key, value);
      return value;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, request);
  return request;
}

export function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string
): Promise<WordAnalysis> {
  const opts = options();
  return cached('word', wordKey(opts.lang, word, sentenceContext), () =>
    gemini.analyzeWord({ word, sentenceContext, articleContext }, opts)
  );
}

export function fetchSentenceAnalysis(sentence: string, articleContext?: string): Promise<SentenceAnalysis> {
  const opts = options();
  return cached('sentence', sentenceKey(opts.lang, sentence), () =>
    gemini.analyzeSentence({ sentence, articleContext }, opts)
  );
}

export function assessPronunciation(params: {
  referenceText: string;
  audioBase64?: string;
  mimeType?: string;
  userTranscript?: string;
}): Promise<PronunciationAssessment> {
  return gemini.assessPronunciation(params, options());
}

/** Drills are kept per article and type; `fresh` asks for a new set and replaces the saved one. */
export function generatePracticeDrills(
  articleText: string,
  type: string = 'syntax',
  fresh = false
): Promise<PracticeDeck> {
  const opts = options();
  return cached('drills', drillsKey(opts.lang, type, articleText), () => gemini.generateDrills({ articleText, type }, opts), fresh);
}
