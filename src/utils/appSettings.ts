import type { GradingOptions } from '../services/exercises/grading';
import { getProvider } from '../services/ai/providers';

/**
 * User settings: which provider and model write the answers, which provider
 * speaks them, one API key per provider (so the two can differ), and the
 * practice preferences (how answers are compared and dictation is played).
 * Display names live in the locale files (providers.*, models.*, voices.*).
 */

export interface AppSettings {
  textProvider: string;
  textModel: string;
  speechProvider: string;
  speechModel: string;
  speechVoice: string;
  /** API keys by provider id. Never part of a backup. */
  apiKeys: Record<string, string>;
  /** Accents count as spelling mistakes when checking an answer. */
  practiceStrictAccents: boolean;
  /** Playback rate the dictation control speaks at. */
  practiceDictationSpeed: number;
  /** Speak a dictation item again once it is checked. */
  practiceSpeakAfterCheck: boolean;
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

function defaults(): AppSettings {
  const text = textDefaults(DEFAULT_PROVIDER)!;
  const speech = speechDefaults(DEFAULT_PROVIDER)!;
  return {
    textProvider: DEFAULT_PROVIDER,
    textModel: text.defaultModel,
    speechProvider: DEFAULT_PROVIDER,
    speechModel: speech.defaultModel,
    speechVoice: speech.defaultVoice,
    apiKeys: {},
    practiceStrictAccents: false,
    practiceDictationSpeed: DEFAULT_DICTATION_SPEED,
    practiceSpeakAfterCheck: false,
  };
}

/** Keeps a stored value usable: unknown providers, models or voices fall back to the provider's defaults. */
function normalize(raw: Partial<AppSettings>): AppSettings {
  const base = defaults();
  const textProvider = getProvider(raw.textProvider ?? base.textProvider).info;
  const speechProvider = getProvider(raw.speechProvider ?? base.speechProvider).info;
  const text = textProvider.text ?? textDefaults(DEFAULT_PROVIDER)!;
  const speech = speechProvider.speech ?? speechDefaults(DEFAULT_PROVIDER)!;
  return {
    textProvider: textProvider.id,
    textModel: text.models.includes(raw.textModel ?? '') ? raw.textModel! : text.defaultModel,
    speechProvider: speechProvider.id,
    speechModel: speech.models.includes(raw.speechModel ?? '') ? raw.speechModel! : speech.defaultModel,
    speechVoice: speech.voices.some((v) => v.id === raw.speechVoice) ? raw.speechVoice! : speech.defaultVoice,
    apiKeys: { ...(raw.apiKeys ?? {}) },
    practiceStrictAccents: boolOr(raw.practiceStrictAccents, false),
    practiceDictationSpeed: speedOr(raw.practiceDictationSpeed),
    practiceSpeakAfterCheck: boolOr(raw.practiceSpeakAfterCheck, false),
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

/** True when the provider that writes the answers has a key. */
export const hasTextKey = (settings: AppSettings = getAppSettings()) => !!getApiKey(settings, settings.textProvider);

/** True when the provider that speaks has a key (otherwise the browser's own voice is used). */
export const hasSpeechKey = (settings: AppSettings = getAppSettings()) =>
  !!getApiKey(settings, settings.speechProvider);

/** How the sheet compares answers: strict accents from the Practice settings. */
export const practiceGrading = (): GradingOptions => ({ strictAccents: getAppSettings().practiceStrictAccents });
