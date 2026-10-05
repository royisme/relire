/**
 * Global App Settings & Model Configuration
 * User settings: Gemini key, analysis model, TTS model and voice. Display names live in the locale files (models.*, voices.*).
 */

export interface AppSettings {
  customApiKey: string;
  analysisModel: string;
  ttsModel: string;
  ttsVoice: 'Kore' | 'Charon' | 'Zephyr' | 'Puck';
}

const SETTINGS_KEY = 'relire_app_settings_v1';

export const AVAILABLE_ANALYSIS_MODELS = [
  {
    id: 'gemini-2.5-flash',
  },
  {
    id: 'gemini-2.5-pro',
  },
  {
    id: 'gemini-3.8-flash',
  },
  {
    id: 'gemini-3.1-flash-lite',
  },
];

export const AVAILABLE_TTS_MODELS = [
  {
    id: 'gemini-3.8-flash-lite-tts',
  },
];

export const AVAILABLE_VOICES = [
  {
    id: 'Kore',
    gender: 'female' as const,
  },
  {
    id: 'Charon',
    gender: 'male' as const,
  },
  {
    id: 'Zephyr',
    gender: 'female' as const,
  },
  {
    id: 'Puck',
    gender: 'male' as const,
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  customApiKey: '',
  analysisModel: 'gemini-2.5-flash',
  ttsModel: 'gemini-3.8-flash-lite-tts',
  ttsVoice: 'Kore',
};

export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save app settings to localStorage', err);
  }
  return updated;
}
