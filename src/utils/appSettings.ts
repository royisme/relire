/**
 * Global App Settings & Model Configuration
 * Supports custom deployment API keys, distinct analysis models, and TTS models.
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
    name: 'Gemini 2.5 Flash (官方推荐)',
    nameEn: 'Gemini 2.5 Flash (Recommended)',
    desc: '响应迅速，适合初学至 B2 语法拆解与即时纠音',
    descEn: 'Fast and responsive, ideal for A1-B2 morphology and pronunciation feedback',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro (深度分析)',
    nameEn: 'Gemini 2.5 Pro (Deep Analysis)',
    desc: '高阶复杂长难句剖析与深度多模态能力',
    descEn: 'Advanced complex sentence parsing and deep linguistic reasoning',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (新一代多模态)',
    nameEn: 'Gemini 3.8 Flash (Next-Gen Multimodal)',
    desc: '兼顾深度思维与极佳口语纠音评测',
    descEn: 'Balances thinking speed with accurate oral evaluation',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite (超低延迟)',
    nameEn: 'Gemini 3.1 Flash-Lite (Low Latency)',
    desc: '极简轻量级模型，适合低配网络快速浏览',
    descEn: 'Lightweight and low-latency, great for fast browsing',
  },
];

export const AVAILABLE_TTS_MODELS = [
  {
    id: 'gemini-3.8-flash-lite-tts',
    name: 'Gemini 3.8 Flash-Lite TTS (官方推荐)',
    nameEn: 'Gemini 3.8 Flash-Lite TTS (Official Recommended)',
    desc: '24kHz 高采样率纯正母语法语发音合成，带自然连音与语调',
    descEn: '24kHz studio-quality native French synthesis with natural liaisons',
  },
];

export const AVAILABLE_VOICES = [
  {
    id: 'Kore',
    name: 'Kore (女声 · 清亮优雅，推荐)',
    nameEn: 'Kore (Female · Clear & Elegant, Recommended)',
    gender: 'female' as const,
  },
  {
    id: 'Charon',
    name: 'Charon (男声 · 醇厚沉稳)',
    nameEn: 'Charon (Male · Warm & Deep)',
    gender: 'male' as const,
  },
  {
    id: 'Zephyr',
    name: 'Zephyr (女声 · 亲和温和)',
    nameEn: 'Zephyr (Female · Friendly & Warm)',
    gender: 'female' as const,
  },
  {
    id: 'Puck',
    name: 'Puck (男声 · 阳光自然)',
    nameEn: 'Puck (Male · Natural & Radiant)',
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
