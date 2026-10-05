export type Lang = 'zh' | 'en';

/** A provider-neutral request for structured (JSON) output. */
export interface JsonRequest {
  prompt: string;
  /** A recording for providers that can listen to it. */
  audio?: { mimeType: string; base64: string };
}

export interface TextConfig {
  apiKey: string;
  model: string;
}

export interface SpeechConfig extends TextConfig {
  voice: string;
}

/** Writes structured answers: word and sentence analysis, drills, pronunciation scoring. */
export interface TextProvider {
  /** Without audio input the learner's recording is dropped and only the transcript is scored. */
  supportsAudioInput: boolean;
  generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T>;
  /** Makes one tiny request so a pasted key can be checked before it is saved. */
  checkKey(config: TextConfig): Promise<void>;
}

/** Turns text into a playable clip (WAV). */
export interface SpeechProvider {
  synthesize(request: { text: string; style?: string }, config: SpeechConfig): Promise<Blob>;
}

export interface VoiceInfo {
  id: string;
  gender: 'female' | 'male';
}

/** What the settings screen needs to know about a provider. Display names live in the locale files. */
export interface ProviderInfo {
  id: string;
  /** Where the user creates an API key. */
  keyUrl: string;
  text?: { models: string[]; defaultModel: string };
  speech?: { models: string[]; defaultModel: string; voices: VoiceInfo[]; defaultVoice: string };
}

/** A provider offers text, speech or both. */
export interface Provider {
  info: ProviderInfo;
  text?: TextProvider;
  speech?: SpeechProvider;
}
