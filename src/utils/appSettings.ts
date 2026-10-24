import type { GradingOptions } from '../services/exercises/grading';
import { getProvider, providerRequiresKey } from '../services/ai/providers';
import { normalizeModelId } from '../services/ai/catalogue';
import { normalizeBaseUrl } from '../services/ai/baseUrl';
import { normalizeAzureRegion } from '../services/ai/providers/azure/region';

/**
 * User settings: which provider and model write the answers, which provider
 * reads page images, which provider speaks them or assesses recordings, shared keys/regions,
 * endpoint overrides, and the practice preferences (how answers are compared and
 * dictation is played). Display names live in the locale files (providers.*, models.*, voices.*).
 */

/** The model and voice last used with one speech engine, so switching back to it restores them. */
export interface SpeechChoice {
  model: string;
  voice: string;
}

export interface AppSettings {
  textProvider: string;
  textModel: string;
  ocrProvider: string;
  ocrModel: string;
  speechProvider: string;
  speechModel: string;
  speechVoice: string;
  assessmentProvider: string;
  /** Empty: assessment is model-less, retained only for indexed purpose selection. */
  assessmentModel: string;
  /** Provider regions stay local beside keys, never in backups. */
  providerRegions: Record<string, string>;
  /** Model and voice per speech engine, by provider id; the selected engine's own choice is `speechModel` /
   * `speechVoice`, and its entry here is kept in step when the AI slice saves. */
  speechChoices: Record<string, SpeechChoice>;
  /** API keys by provider id. Never part of a backup. */
  apiKeys: Record<string, string>;
  /** Endpoint overrides by provider id; absent means the provider's default. Part of a backup. */
  baseUrls: Record<string, string>;
  /** Accents count as spelling mistakes when checking an answer. */
  practiceStrictAccents: boolean;
  /** Playback rate the dictation control speaks at. */
  practiceDictationSpeed: number;
  /** Speak a dictation item again once it is checked. */
  practiceSpeakAfterCheck: boolean;
  /** Let automatic playback synthesize remotely; off, it may only use the device voice. */
  practiceRemoteAutoSpeak: boolean;
  /** Transcribe a recording with the browser's speech recognition, which helps scoring; on, the browser
   *  may send the audio to its vendor's speech service. */
  practiceBrowserRecognition: boolean;
}

/** The playback rates the Practice section offers, as the reader's speed control does. */
export const DICTATION_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;
/** A touch slower than natural reading, so a number can be written down as it is heard. */
export const DEFAULT_DICTATION_SPEED = 0.75;

const speedOr = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1.5, Math.max(0.5, value)) : DEFAULT_DICTATION_SPEED;
const boolOr = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const SETTINGS_KEY = 'relire_app_settings_v1';
const DEFAULT_PROVIDER = 'gemini';

const textDefaults = (providerId: string) => getProvider(providerId).info.text;
const speechDefaults = (providerId: string) => getProvider(providerId).info.speech;

/**
 * A listed voice is the whitelist; a provider with no fixed list (an empty `voices`) keeps any id its own
 * check accepts. Anything else falls back to the provider's default voice.
 */
function storedVoice(providerId: string, value: unknown): string | undefined {
  const provider = getProvider(providerId);
  const voices = provider.info.speech?.voices ?? [];
  const voice = typeof value === 'string' ? value.trim() : '';
  if (!voice) return undefined;
  if (voices.length) return voices.some((entry) => entry.id === voice) ? voice : undefined;
  return provider.speech?.acceptsVoice?.(voice) ? voice : undefined;
}

/**
 * Last model and voice per speech engine. Only a registered speech engine is kept, which bounds the map; an
 * entry whose model storage cannot keep is dropped entirely, and a voice it cannot take falls back to the
 * engine's default, so a bad remembered value is never stored or restored.
 */
function storedSpeechChoices(value: unknown): Record<string, SpeechChoice> {
  const kept: Record<string, SpeechChoice> = {};
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  for (const [id, entry] of Object.entries(raw)) {
    const provider = getProvider(id);
    const speech = provider.info.speech;
    if (provider.info.id !== id || !speech) continue;
    const choice = (entry && typeof entry === 'object' ? entry : {}) as Partial<SpeechChoice>;
    const model = speech.device ? '' : normalizeModelId(choice.model);
    if (model === undefined) continue;
    kept[id] = { model, voice: speech.device ? '' : (storedVoice(id, choice.voice) ?? speech.defaultVoice) };
  }
  return kept;
}

function defaults(): AppSettings {
  const text = textDefaults(DEFAULT_PROVIDER)!;
  const speech = speechDefaults(DEFAULT_PROVIDER)!;
  return {
    textProvider: DEFAULT_PROVIDER,
    textModel: text.defaultModel,
    ocrProvider: DEFAULT_PROVIDER,
    ocrModel: text.defaultModel,
    speechProvider: DEFAULT_PROVIDER,
    speechModel: speech.defaultModel,
    speechVoice: speech.defaultVoice,
    speechChoices: {},
    assessmentProvider: 'azure',
    assessmentModel: '',
    providerRegions: {},
    apiKeys: {},
    baseUrls: {},
    practiceStrictAccents: false,
    practiceDictationSpeed: DEFAULT_DICTATION_SPEED,
    practiceSpeakAfterCheck: false,
    practiceRemoteAutoSpeak: false,
    practiceBrowserRecognition: false,
  };
}

/** Validate browser storage, retaining custom IDs even when absent from a fetched or static catalogue. */
function normalize(value: unknown): AppSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<AppSettings>) : {};
  const base = defaults();
  const textProvider = getProvider(raw.textProvider ?? base.textProvider).info;
  const ocrProvider = getProvider(raw.ocrProvider ?? base.ocrProvider).info;
  const speechProvider = getProvider(raw.speechProvider ?? base.speechProvider).info;
  const candidate = getProvider(raw.assessmentProvider ?? base.assessmentProvider);
  const assessmentProvider = candidate.assessment ? candidate.info.id : base.assessmentProvider;
  const text = textProvider.text ?? textDefaults(DEFAULT_PROVIDER)!;
  const ocr = ocrProvider.text ?? textDefaults(DEFAULT_PROVIDER)!;
  const speech = speechProvider.speech ?? speechDefaults(DEFAULT_PROVIDER)!;
  // A device engine has no model and no voice: storage never keeps one for it, whatever was written.
  const deviceSpeech = speech.device === true;
  const apiKeys = Object.fromEntries(
    Object.entries(
      raw.apiKeys && typeof raw.apiKeys === 'object' && !Array.isArray(raw.apiKeys) ? raw.apiKeys : {},
    ).filter(([, key]) => typeof key === 'string'),
  );
  // An override storage cannot use is dropped, so the provider's own default is called instead.
  const baseUrls = Object.fromEntries(
    Object.entries(raw.baseUrls && typeof raw.baseUrls === 'object' && !Array.isArray(raw.baseUrls) ? raw.baseUrls : {})
      .map(([id, value]) => [id, normalizeBaseUrl(value)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );
  const providerRegions = Object.fromEntries(
    Object.entries(
      raw.providerRegions && typeof raw.providerRegions === 'object' && !Array.isArray(raw.providerRegions)
        ? raw.providerRegions
        : {},
    )
      .map(([id, value]) => [id, normalizeAzureRegion(value)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );
  return {
    textProvider: textProvider.id,
    textModel: normalizeModelId(raw.textModel) ?? text.defaultModel,
    ocrProvider: ocrProvider.id,
    ocrModel: normalizeModelId(raw.ocrModel) ?? ocr.defaultModel,
    speechProvider: speechProvider.id,
    speechModel: deviceSpeech ? '' : (normalizeModelId(raw.speechModel) ?? speech.defaultModel),
    speechVoice: deviceSpeech ? '' : (storedVoice(speechProvider.id, raw.speechVoice) ?? speech.defaultVoice),
    speechChoices: storedSpeechChoices(raw.speechChoices),
    assessmentProvider,
    assessmentModel: '',
    providerRegions,
    apiKeys,
    baseUrls,
    practiceStrictAccents: boolOr(raw.practiceStrictAccents, false),
    practiceDictationSpeed: speedOr(raw.practiceDictationSpeed),
    practiceSpeakAfterCheck: boolOr(raw.practiceSpeakAfterCheck, false),
    practiceRemoteAutoSpeak: boolOr(raw.practiceRemoteAutoSpeak, false),
    practiceBrowserRecognition: boolOr(raw.practiceBrowserRecognition, false),
  };
}

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normalize(raw ? JSON.parse(raw) : {});
  } catch {
    return defaults();
  }
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const updated = normalize({ ...getAppSettings(), ...settings });
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save app settings to localStorage', err);
  }
  return updated;
}

export const getApiKey = (settings: AppSettings, providerId: string) => settings.apiKeys[providerId]?.trim() ?? '';

/** The provider's endpoint override, or '' for its default. */
export const getBaseUrl = (settings: AppSettings, providerId: string) => settings.baseUrls[providerId] ?? '';

/** True when the provider needs no key (a local server) or the learner has saved one. */
const keyReady = (settings: AppSettings, providerId: string) =>
  !providerRequiresKey(providerId) || !!getApiKey(settings, providerId);

/** True when the provider that writes the answers has a key, or needs none. */
export const hasTextKey = (settings: AppSettings = getAppSettings()) => keyReady(settings, settings.textProvider);

/** OCR has its own selection, never inherited from Text AI. */
export const hasOcrKey = (settings: AppSettings = getAppSettings()) => keyReady(settings, settings.ocrProvider);

/** True when the provider that speaks has a key. */
export const hasSpeechKey = (settings: AppSettings = getAppSettings()) => keyReady(settings, settings.speechProvider);

/** How the sheet compares answers: strict accents from the Practice settings. */
export const practiceGrading = (): GradingOptions => ({ strictAccents: getAppSettings().practiceStrictAccents });

/**
 * Whether something may speak by itself (a dictation item after its check), and with which engine: the
 * Practice preference is the master switch; on, the selected engine speaks once the learner has opted
 * into remote synthesis (or when that engine is the device voice itself), and with the device voice
 * otherwise, because it costs nothing and synthesizes nothing. Explicit Listen uses the selection except
 * for items declaring meta.playbackEngine === 'device' (reader dictation), whose Listen and after-check
 * replay use the device voice, still subject to this master switch.
 */
export const speechAfterCheck = (settings: AppSettings = getAppSettings()): 'selected' | 'device' | null =>
  !settings.practiceSpeakAfterCheck
    ? null
    : settings.practiceRemoteAutoSpeak || getProvider(settings.speechProvider).info.speech?.device === true
      ? 'selected'
      : 'device';
