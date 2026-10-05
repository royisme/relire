import { WordAnalysis, SentenceAnalysis, PronunciationAssessment, PracticeDeck } from '../types';
import { getAppSettings } from '../utils/appSettings';
import i18n from '../i18n';
import * as gemini from './gemini';

export { MissingApiKeyError } from './gemini';

const wordCache = new Map<string, WordAnalysis>();
const sentenceCache = new Map<string, SentenceAnalysis>();

function options(): gemini.GeminiOptions {
  const settings = getAppSettings();
  return {
    apiKey: settings.customApiKey,
    model: settings.analysisModel,
    lang: i18n.language === 'zh' ? 'zh' : 'en',
  };
}

export async function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string
): Promise<WordAnalysis> {
  const opts = options();
  const cacheKey = `${opts.model}_${opts.lang}_${word.toLowerCase().trim()}_${sentenceContext.slice(0, 30)}`;
  const cached = wordCache.get(cacheKey);
  if (cached) return cached;

  const data = await gemini.analyzeWord({ word, sentenceContext, articleContext }, opts);
  wordCache.set(cacheKey, data);
  return data;
}

export async function fetchSentenceAnalysis(
  sentence: string,
  articleContext?: string
): Promise<SentenceAnalysis> {
  const opts = options();
  const cacheKey = `${opts.model}_${opts.lang}_${sentence.trim()}`;
  const cached = sentenceCache.get(cacheKey);
  if (cached) return cached;

  const data = await gemini.analyzeSentence({ sentence, articleContext }, opts);
  sentenceCache.set(cacheKey, data);
  return data;
}

export function assessPronunciation(params: {
  referenceText: string;
  audioBase64?: string;
  mimeType?: string;
  userTranscript?: string;
}): Promise<PronunciationAssessment> {
  return gemini.assessPronunciation(params, options());
}

export function generatePracticeDrills(articleText: string, type: string = 'syntax'): Promise<PracticeDeck> {
  return gemini.generateDrills({ articleText, type }, options());
}
