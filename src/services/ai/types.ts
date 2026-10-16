export type Lang = 'zh' | 'en';

/** An image for providers that can read pictures. `data` is plain base64, without a `data:` prefix. */
export interface ImageInput {
  data: string;
  mimeType: string;
}

/** A provider-neutral request for structured (JSON) output. */
export interface JsonRequest {
  prompt: string;
  /** Optional provider-side output constraint; still validate at the task boundary. */
  jsonSchema?: Record<string, unknown>;
  /** A recording for providers that can listen to it. */
  audio?: { mimeType: string; base64: string };
  /** Pictures for providers that can read them (see `TextProvider.supportsImageInput`). */
  images?: ImageInput[];
  /** Cancels the request; a cancelled request throws an `AbortError` and is never retried. */
  signal?: AbortSignal;
  /** Send one request to the chosen model only: no retry and no switch to another model. */
  singleAttempt?: boolean;
}

export interface TextConfig {
  apiKey: string;
  model: string;
}

export interface SpeechConfig extends TextConfig {
  voice: string;
}

/** Writes structured answers: word and sentence analysis, drills, exercises, grading, pronunciation scoring. */
export interface TextProvider {
  /** Without audio input the learner's recording is dropped and only the transcript is scored. */
  supportsAudioInput: boolean;
  /** Whether the given model can read images; a request with images to any other model is refused. */
  supportsImageInput(model: string): boolean;
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
  /** `imageModels` are the `models` that accept images, for the settings screen and import. */
  text?: { models: string[]; defaultModel: string; imageModels?: string[] };
  speech?: { models: string[]; defaultModel: string; voices: VoiceInfo[]; defaultVoice: string };
}

/** A provider offers text, speech or both. */
export interface Provider {
  info: ProviderInfo;
  text?: TextProvider;
  speech?: SpeechProvider;
}
