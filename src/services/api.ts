import { WordAnalysis, SentenceAnalysis, PronunciationAssessment } from '../types';
import { getApiKey, getAppSettings, type AppSettings } from '../utils/appSettings';
import i18n from '../i18n';
import * as ai from './ai/tasks';
import { getTextProvider } from './ai/providers';
import {
  exerciseArticleText,
  getPromptTemplate,
  promptFingerprint,
  subscribePromptChanges,
  type AdaptiveInput,
  type ExtractInput,
  type ItemContext,
} from './ai/prompts';
import type { Lang } from './ai/types';
import { cachedRequest, readCachedAnswer } from './cachedRequest';
import { exercisesKey, explanationKey, hintKey, prosodyKey, sentenceKey, wordKey } from '../storage/cache';
import {
  ExplanationSchema,
  GeneratedSetSchema,
  HintSchema,
  type Drills,
  type Explanation,
  type GeneratedSet,
  type Hint,
  type OpenGrade,
} from '../types/exerciseAi';
import type { ImportDraft } from './exercises/importDraft';
import {
  MAX_PRONUNCIATION_SOURCE,
  PRONUNCIATION_SCHEMA_VERSION,
  READER_TOKENIZER_VERSION,
} from '../types/pronunciation';
import { hasGraphemeSupport } from '../utils/readerTokens';
import { validatePronunciationMarkers } from '../utils/pronunciationMarkers';

/**
 * What the UI calls: reads the user's settings and language, decides what is
 * cached and under which key, and delegates the request to the AI layer.
 * Cache keys carry a fingerprint of the prompt but deliberately ignore the
 * provider, model and article context, so switching models or meeting the same
 * sentence in another article never re-spends tokens.
 */

export { ImageInputUnsupportedError, InvalidAnswerError, MissingApiKeyError, isAbortError } from './ai/errors';
export { MAX_GENERATED_ITEMS } from './ai/tasks';

function context(settings: AppSettings = getAppSettings()): ai.TextContext & { lang: Lang } {
  return {
    provider: getTextProvider(settings.textProvider),
    config: { apiKey: getApiKey(settings, settings.textProvider), model: settings.textModel },
    lang: i18n.language === 'zh' ? 'zh' : 'en',
  };
}

export function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string,
): Promise<WordAnalysis> {
  const ctx = context();
  return cachedRequest('word', wordKey(ctx.lang, promptFingerprint('word', ctx.lang), word, sentenceContext), () =>
    ai.analyzeWord({ word, sentenceContext, articleContext }, ctx),
  );
}

export function fetchSentenceAnalysis(sentence: string, articleContext?: string): Promise<SentenceAnalysis> {
  const ctx = context();
  return cachedRequest('sentence', sentenceKey(ctx.lang, promptFingerprint('sentence', ctx.lang), sentence), () =>
    ai.analyzeSentence({ sentence, articleContext }, ctx),
  );
}

export function getPronunciationIdentity(): string {
  const lang = i18n.language === 'zh' ? 'zh' : 'en';
  return `${lang}|${promptFingerprint('prosody', lang)}|v${PRONUNCIATION_SCHEMA_VERSION}.t${READER_TOKENIZER_VERSION}`;
}

export function subscribePronunciationContext(listener: () => void): () => void {
  const unsubscribe = subscribePromptChanges(listener);
  i18n.on('languageChanged', listener);
  return () => {
    unsubscribe();
    i18n.off('languageChanged', listener);
  };
}

/** Freeze settings/template for a queue; later edits cannot poison its old cache key. */
export function createPronunciationSession() {
  const ctx = context();
  const fingerprint = promptFingerprint('prosody', ctx.lang);
  const template = getPromptTemplate('prosody', ctx.lang);
  const key = (source: string) => prosodyKey(ctx.lang, fingerprint, source);
  const supported = (source: string) => {
    if (!hasGraphemeSupport()) throw new Error(i18n.t('prosody.unsupportedBrowser'));
    if (source.length > MAX_PRONUNCIATION_SOURCE) throw new Error(i18n.t('prosody.oversizedSentence'));
  };
  return {
    identity: `${ctx.lang}|${fingerprint}|v${PRONUNCIATION_SCHEMA_VERSION}.t${READER_TOKENIZER_VERSION}`,
    async getCached(source: string) {
      supported(source);
      return readCachedAnswer('prosody', key(source), (value) => validatePronunciationMarkers(value, source));
    },
    async fetch(source: string) {
      supported(source);
      return cachedRequest(
        'prosody',
        key(source),
        () => ai.annotatePronunciation({ source, template }, ctx),
        false,
        (value) => validatePronunciationMarkers(value, source),
      );
    },
  };
}

export type PronunciationSession = ReturnType<typeof createPronunciationSession>;

export function fetchPronunciationMarkers(source: string, session = createPronunciationSession()) {
  return session.fetch(source);
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
    context(),
  );
}

/**
 * Exercise help. Hints and explanations are kept for 30 days under language +
 * prompt fingerprint + the normalized item, never provider or model; answers
 * are revalidated on every hit. Open-answer grades, adaptive drills and
 * extraction are never cached: each depends on a fresh learner answer or on
 * files, and a stale grade or draft would be wrong rather than merely old.
 */
export function fetchHint(input: ItemContext & { exerciseType: string }): Promise<Hint> {
  const ctx = context();
  return cachedRequest(
    'hint',
    hintKey(ctx.lang, promptFingerprint('hint', ctx.lang), input),
    () => ai.hint(input, ctx),
    false,
    (value) => HintSchema.parse(value),
  );
}

export function fetchExplanation(input: ItemContext & { expectedAnswer: string }): Promise<Explanation> {
  const ctx = context();
  return cachedRequest(
    'explanation',
    explanationKey(ctx.lang, promptFingerprint('explain', ctx.lang), input),
    () => ai.explainMistake(input, ctx),
    false,
    (value) => ExplanationSchema.parse(value),
  );
}

/** Not cached: every answer is different, and the verdict must reflect this one. */
export function gradeOpenAnswer(
  input: Omit<ItemContext, 'grammarTag'> & { expectedAnswer: string },
): Promise<OpenGrade> {
  return ai.gradeOpenAnswer(input, context());
}

/** Not cached: drills follow the learner's latest mistakes. */
export function generateAdaptiveDrills(input: AdaptiveInput): Promise<Drills> {
  return ai.generateAdaptiveDrills(input, context());
}

/**
 * Reads text or page images into an import draft. Not cached, one attempt, no
 * fallback model; `signal` cancels it (the request throws an `AbortError`,
 * see `isAbortError`). Images are refused up front when the chosen model
 * cannot read them (`ImageInputUnsupportedError`).
 */
export function extractMaterial(input: ExtractInput, consentSettings?: AppSettings): Promise<ImportDraft> {
  return ai.extractMaterial(input, context(consentSettings));
}

/**
 * Exercise units made from an article, kept per article text + count + level
 * (the first 8,000 characters of the article are used); `fresh` asks for a new
 * set and replaces the saved one. The result is the kept set: items whose quote
 * is not in the article are already left out and counted in `dropped`, and a
 * cached set stays exactly that.
 */
export function generateExercises(
  input: { articleText: string; count: number; level: string },
  fresh = false,
): Promise<GeneratedSet> {
  const ctx = context();
  return cachedRequest(
    'exercises',
    exercisesKey(
      ctx.lang,
      promptFingerprint('exercises', ctx.lang),
      input.level,
      input.count,
      exerciseArticleText(input.articleText),
    ),
    () => ai.generateExercises(input, ctx),
    fresh,
    (value) => GeneratedSetSchema.parse(value),
  );
}

/** What the import screen shows before it sends pages: who reads them, and whether that model can. */
export function getTextModelStatus(): { providerId: string; model: string; readsImages: boolean } {
  const settings = getAppSettings();
  const provider = getTextProvider(settings.textProvider);
  return {
    providerId: settings.textProvider,
    model: settings.textModel,
    readsImages: provider.supportsImageInput(settings.textModel),
  };
}

/** Checks a pasted key against the text provider before it is saved. Defaults to the stored provider and model. */
export function checkTextKey(apiKey: string, settings: AppSettings = getAppSettings()): Promise<void> {
  return getTextProvider(settings.textProvider).checkKey({ apiKey, model: settings.textModel });
}
