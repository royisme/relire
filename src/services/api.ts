import { WordAnalysis, SentenceAnalysis, PronunciationAssessment, PracticeDeck } from '../types';
import { getAppSettings } from '../utils/appSettings';
import i18n from '../i18n';

const wordCache = new Map<string, WordAnalysis>();
const sentenceCache = new Map<string, SentenceAnalysis>();

function getRequestHeaders(): Record<string, string> {
  const settings = getAppSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.customApiKey?.trim()) {
    headers['x-gemini-api-key'] = settings.customApiKey.trim();
  }
  if (settings.analysisModel) {
    headers['x-gemini-analysis-model'] = settings.analysisModel;
  }
  headers['x-user-lang'] = i18n.language === 'zh' ? 'zh' : 'en';
  return headers;
}

export async function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string
): Promise<WordAnalysis> {
  const settings = getAppSettings();
  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  const cacheKey = `${settings.analysisModel}_${lang}_${word.toLowerCase().trim()}_${sentenceContext.slice(0, 30)}`;
  if (wordCache.has(cacheKey)) {
    return wordCache.get(cacheKey)!;
  }

  const res = await fetch('/api/analyze-word', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      word,
      sentenceContext,
      articleContext,
      model: settings.analysisModel,
      lang,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to analyze word' }));
    throw new Error(errorData.error || 'Word analysis failed');
  }

  const data: WordAnalysis = await res.json();
  wordCache.set(cacheKey, data);
  return data;
}

export async function fetchSentenceAnalysis(
  sentence: string,
  articleContext?: string
): Promise<SentenceAnalysis> {
  const settings = getAppSettings();
  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  const cacheKey = `${settings.analysisModel}_${lang}_${sentence.trim()}`;
  if (sentenceCache.has(cacheKey)) {
    return sentenceCache.get(cacheKey)!;
  }

  const res = await fetch('/api/analyze-sentence', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      sentence,
      articleContext,
      model: settings.analysisModel,
      lang,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to analyze sentence' }));
    throw new Error(errorData.error || 'Sentence analysis failed');
  }

  const data: SentenceAnalysis = await res.json();
  sentenceCache.set(cacheKey, data);
  return data;
}

export async function assessPronunciation(params: {
  referenceText: string;
  audioBase64?: string;
  mimeType?: string;
  userTranscript?: string;
}): Promise<PronunciationAssessment> {
  const settings = getAppSettings();
  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  const res = await fetch('/api/assess-pronunciation', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      ...params,
      model: settings.analysisModel,
      lang,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to assess pronunciation' }));
    throw new Error(errorData.error || 'Pronunciation assessment failed');
  }

  return await res.json();
}

export async function generatePracticeDrills(
  articleText: string,
  type: string = 'syntax'
): Promise<PracticeDeck> {
  const settings = getAppSettings();
  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  const res = await fetch('/api/practice-generate', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      articleText,
      type,
      model: settings.analysisModel,
      lang,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to generate exercises' }));
    throw new Error(errorData.error || 'Practice generation failed');
  }

  return await res.json();
}
