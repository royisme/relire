import { WordAnalysis, SentenceAnalysis, PronunciationAssessment } from '../types';
import { vocabularyKey } from './vocabulary/identity';
import { VocabularyAnalysisSchema } from '../types/vocabulary';
import { getAppSettings, type AppSettings } from '../utils/appSettings';
import i18n from '../i18n';
import * as ai from './ai/tasks';
import { getAiAccess } from './ai/access';
import {
  exerciseArticleText,
  getPromptTemplate,
  promptFingerprint,
  subscribePromptChanges,
  type AdaptiveInput,
  type ExtractInput,
  type ItemContext,
  type TranscribeInput,
} from './ai/prompts';
import type { AiAccess, TextPurpose } from './ai/types';
import { cachedRequest, readCachedAnswer } from './cachedRequest';
import {
  conjugationKey,
  exercisesKey,
  explanationKey,
  hintKey,
  prosodyKey,
  sentenceKey,
  wordKey,
} from '../storage/cache';
import {
  ExplanationSchema,
  GeneratedSetSchema,
  validateGeneratedArea,
  HintSchema,
  type Drills,
  type Explanation,
  type GeneratedSet,
  type Hint,
  type OpenGrade,
} from '../types/exerciseAi';
import { ConjugationAnswerSchema, type ConjugationAnswer } from '../types/conjugationAnswer';
import type { ArticleExerciseArea } from '../types/learningArea';
import type { ImportDraft } from './exercises/importDraft';
import { engineInfinitive } from './conjugation/infinitive';
import type { Transcription } from '../types/transcription';
import {
  MAX_PRONUNCIATION_SOURCE,
  PRONUNCIATION_SCHEMA_VERSION,
  READER_TOKENIZER_VERSION,
} from '../types/pronunciation';
import { hasGraphemeSupport } from '../utils/readerTokens';
import { validatePronunciationMarkers } from '../utils/pronunciationMarkers';
import { decodeTakeToPcm16k } from '../utils/speech/pcm';

/**
 * What the UI calls: reads the user's settings and language, decides what is
 * cached and under which key, and delegates the request to the AI layer.
 * Cache keys carry a fingerprint of the prompt but deliberately ignore the
 * provider, model and article context, so switching models or meeting the same
 * sentence in another article never re-spends tokens.
 */

export { ImageInputUnsupportedError, InvalidAnswerError, MissingApiKeyError, isAbortError } from './ai/errors';
export { MAX_GENERATED_ITEMS } from './ai/tasks';

function context(access: AiAccess = getAiAccess(), purpose: TextPurpose = 'text'): ai.TextContext {
  return {
    execution: access.text(purpose),
    lang: i18n.language === 'zh' ? 'zh' : 'en',
  };
}

export function fetchWordAnalysis(
  word: string,
  sentenceContext: string,
  articleContext?: string,
): Promise<WordAnalysis> {
  const ctx = context();
  return cachedRequest(
    'word',
    wordKey(ctx.lang, promptFingerprint('word', ctx.lang), word, sentenceContext),
    () => ai.analyzeWord({ word, sentenceContext, articleContext }, ctx),
    false,
    (value) => {
      const answer = VocabularyAnalysisSchema.parse(value);
      if (vocabularyKey(answer.word) !== vocabularyKey(word))
        throw new Error(i18n.getFixedT(ctx.lang)('vocab.analysisMismatch', { actual: answer.word, requested: word }));
      return answer;
    },
  );
}

/**
 * The conjugation of a verb outside the pack, kept per language + prompt fingerprint + infinitive and
 * revalidated on every hit. The infinitive is put in the engine's form first, so `s'habiller` and `s’habiller`
 * (or `Parler` and `parler`) are one key and one request; an answer whose infinitive is another one is an error.
 */
export function fetchConjugation(infinitive: string): Promise<ConjugationAnswer> {
  const ctx = context();
  const verb = engineInfinitive(infinitive);
  return cachedRequest(
    'conjugation',
    conjugationKey(ctx.lang, promptFingerprint('conjugate', ctx.lang), verb),
    async () => {
      const answer = await ai.conjugateVerb({ infinitive: verb }, ctx);
      // An answer for another verb must never be cached or shown under this one.
      if (answer.infinitive !== verb) throw new Error(`The model answered for ${answer.infinitive}, not ${verb}.`);
      return answer;
    },
    false,
    (value) => ConjugationAnswerSchema.parse(value),
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

/**
 * Not cached: every recording is different. A configured audio assessment provider scores the take
 * itself (the browser transcript is not sent to it); without one the text AI keeps the old path.
 * There is no fallback between the two: a failure on the chosen path reaches the UI as is.
 */
export async function assessPronunciation(params: {
  referenceText: string;
  audioBase64?: string;
  mimeType?: string;
  /** The recorded take, decoded to PCM for the audio assessment provider. */
  audio?: Blob;
  userTranscript?: string;
  signal?: AbortSignal;
}): Promise<PronunciationAssessment> {
  const access = getAiAccess();
  if (access.isConfigured('assessment')) {
    // The reference text alone must never pass for a read: without the take there is nothing to score.
    if (!params.audio) throw new Error(i18n.t('errors.noRecordingToScore'));
    const { referenceText, signal } = params;
    return decodeTakeToPcm16k(params.audio).then((pcm) =>
      access.assess({ pcm, referenceText, locale: 'fr-FR', signal }),
    );
  }
  const { referenceText, userTranscript, audioBase64, mimeType, signal } = params;
  return ai.assessPronunciation(
    {
      referenceText,
      userTranscript,
      signal,
      audio: audioBase64 ? { base64: audioBase64, mimeType: mimeType || 'audio/webm' } : undefined,
    },
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
export function extractionPurpose(input: Pick<ExtractInput, 'images'>): TextPurpose {
  return input.images?.length ? 'ocr' : 'text';
}

export function extractMaterial(input: ExtractInput, consentAccess: AiAccess = getAiAccess()): Promise<ImportDraft> {
  return ai.extractMaterial(input, context(consentAccess, extractionPurpose(input)));
}

/**
 * Reads page images into an article's title and text on the OCR selection. Not
 * cached, one attempt, cancellable like `extractMaterial`; images are refused
 * up front when the chosen model cannot read them.
 */
export function transcribeMaterial(
  input: TranscribeInput,
  consentAccess: AiAccess = getAiAccess(),
): Promise<Transcription> {
  return ai.transcribeMaterial(input, context(consentAccess, 'ocr'));
}

/**
 * Exercise units made from an article, kept per article text + count + level
 * (the first 8,000 characters of the article are used); `fresh` asks for a new
 * set and replaces the saved one. The result is the kept set: items whose quote
 * is not in the article are already left out and counted in `dropped`, and a
 * cached set stays exactly that.
 */
export function generateExercises(
  input: { articleText: string; count: number; level: string; learningArea: ArticleExerciseArea },
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
      input.learningArea,
    ),
    () => ai.generateExercises(input, ctx),
    fresh,
    (value) => validateGeneratedArea(GeneratedSetSchema.parse(value), input.learningArea),
  );
}

/** Checks a pasted key against the text provider before it is saved. Defaults to the stored provider and model. */
export function checkTextKey(apiKey: string, settings: AppSettings = getAppSettings()): Promise<void> {
  return getAiAccess({
    ...settings,
    apiKeys: { ...settings.apiKeys, [settings.textProvider]: apiKey },
  }).checkConnection('text');
}
