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

/** Unknown is selectable with consent, not evidence of support or a reason to block a request. */
export type Capability = 'supported' | 'unsupported' | 'unknown';
export type AiPurpose = 'text' | 'ocr' | 'speech';
export type TextPurpose = Exclude<AiPurpose, 'speech'>;

export interface ModelCapabilities {
  textGeneration: Capability;
  imageInput: Capability;
  speechOutput: Capability;
}

/** Discovery metadata is not a successful connection test. IDs are canonical (without `models/`). */
export interface ModelInfo {
  id: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedActions?: string[];
  capabilities: ModelCapabilities;
}

export interface ModelCatalogue {
  listModels(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  capabilities(model: string): ModelCapabilities;
}

/** Bound execution: tasks receive capabilities and execution, never BYOK credentials. */
export interface TextExecution {
  readonly model: string;
  readonly supportsAudioInput: boolean;
  readonly imageInput: Capability;
  generateJson<T>(request: JsonRequest): Promise<T>;
}

export interface AiSelection {
  providerId: string;
  model: string;
  capabilities: ModelCapabilities;
}

export interface SpeechSelection extends AiSelection {
  voice: string;
}

/** The replaceable access boundary. BYOK is its only implementation today. */
export interface AiAccess {
  /** Local readiness, not verification that a key or model will work. */
  isConfigured(purpose: AiPurpose): boolean;
  selection(purpose: 'speech'): SpeechSelection;
  selection(purpose: AiPurpose): AiSelection;
  text(purpose: TextPurpose): TextExecution;
  synthesize(request: { text: string; style?: string; voice?: string; signal?: AbortSignal }): Promise<Blob>;
  checkConnection(purpose: TextPurpose): Promise<void>;
  listModels(purpose: AiPurpose, signal?: AbortSignal): Promise<ModelInfo[]>;
}

/** Writes structured answers: word and sentence analysis, drills, exercises, grading, pronunciation scoring. */
export interface TextProvider {
  /** Without audio input the learner's recording is dropped and only the transcript is scored. */
  supportsAudioInput: boolean;
  /** Only confirmed incompatibility blocks a request; unknown models reach the provider. */
  imageInputCapability(model: string): Capability;
  generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T>;
  /** Makes one tiny request so a pasted key can be checked before it is saved. */
  checkKey(config: TextConfig): Promise<void>;
}

/** Turns text into a playable clip (WAV). */
export interface SpeechProvider {
  synthesize(request: { text: string; style?: string; signal?: AbortSignal }, config: SpeechConfig): Promise<Blob>;
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
  /** Absent means this provider does not offer model discovery. Never guess an endpoint. */
  catalogue?: ModelCatalogue;
  text?: TextProvider;
  speech?: SpeechProvider;
}
