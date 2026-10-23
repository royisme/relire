import type { PronunciationAssessment } from '../../types';

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
  /** Pictures for providers that can read them (see `TextProvider.imageInputCapability`). */
  images?: ImageInput[];
  /** Cancels the request; a cancelled request throws an `AbortError` and is never retried. */
  signal?: AbortSignal;
  /** Send one request to the chosen model only: no retry and no switch to another model. */
  singleAttempt?: boolean;
}

export interface TextConfig {
  apiKey: string;
  model: string;
  /** Endpoint override for an OpenAI-compatible provider; absent (or empty) means the provider's default. */
  baseUrl?: string;
}

export interface SpeechConfig extends TextConfig {
  voice: string;
}

/** Unknown is selectable with consent, not evidence of support or a reason to block a request. */
export type Capability = 'supported' | 'unsupported' | 'unknown';
export type AiPurpose = 'text' | 'ocr' | 'speech' | 'assessment';
export type TextPurpose = 'text' | 'ocr';

/** Recorded audio only: 16 kHz mono signed 16-bit PCM, never a microphone handle. */
export interface AssessmentRequest {
  pcm: Int16Array;
  referenceText: string;
  locale: 'fr-FR' | 'fr-CA';
  signal?: AbortSignal;
}

/** Assessment has a region, not a model or an editable endpoint. */
export interface AssessmentConfig {
  apiKey: string;
  region: string;
}

export interface AssessmentProvider {
  assess(request: AssessmentRequest, config: AssessmentConfig): Promise<PronunciationAssessment>;
  checkKey(config: AssessmentConfig, signal?: AbortSignal): Promise<void>;
}

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
  /** `baseUrl` is the learner's endpoint override; a provider with one fixed host ignores it. */
  listModels(apiKey: string, signal?: AbortSignal, baseUrl?: string): Promise<ModelInfo[]>;
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
  /** The platform's own voice speaks: `model` and `voice` are empty and no clip is ever produced. */
  device: boolean;
}

/** The replaceable access boundary. BYOK is its only implementation today. */
export interface AiAccess {
  /** Local readiness, not verification that a key or model will work. */
  isConfigured(purpose: AiPurpose): boolean;
  selection(purpose: 'speech'): SpeechSelection;
  selection(purpose: AiPurpose): AiSelection;
  text(purpose: TextPurpose): TextExecution;
  /** A playable clip. A `device` engine has none: it throws `DeviceVoiceError`, and playback speaks with the
   * platform's voice instead. */
  synthesize(request: { text: string; style?: string; voice?: string; signal?: AbortSignal }): Promise<Blob>;
  assess(request: AssessmentRequest): Promise<PronunciationAssessment>;
  checkConnection(purpose: TextPurpose | 'assessment', signal?: AbortSignal): Promise<void>;
  listModels(purpose: AiPurpose, signal?: AbortSignal): Promise<ModelInfo[]>;
}

/** Writes structured answers: word and sentence analysis, drills, exercises, grading, pronunciation scoring. */
export interface TextProvider {
  /** Without audio input the learner's recording is dropped and only the transcript is scored. */
  supportsAudioInput: boolean;
  /** Only confirmed incompatibility blocks a request; unknown models reach the provider. */
  imageInputCapability(model: string): Capability;
  generateJson<T>(request: JsonRequest, config: TextConfig): Promise<T>;
  /** Makes one tiny request so a pasted key can be checked before it is saved. The signal cancels it. */
  checkKey(config: TextConfig, signal?: AbortSignal): Promise<void>;
}

/** Turns text into a playable clip (WAV from Gemini, MP3 from Fish Audio). */
export interface SpeechProvider {
  synthesize(request: { text: string; style?: string; signal?: AbortSignal }, config: SpeechConfig): Promise<Blob>;
  /** False for a voice id this provider cannot take; checked before saving and before a request. Absent means
   * the provider's own fixed voice list is the only limit. */
  acceptsVoice?(voice: string): boolean;
}

export interface VoiceInfo {
  id: string;
  gender: 'female' | 'male';
}

/** What the settings screen needs to know about a provider. Display names live in the locale files. */
export interface ProviderInfo {
  id: string;
  /** Where the user creates an API key; absent for a provider that has none. */
  keyUrl?: string;
  /** The endpoint this provider calls unless the learner overrides it; only such providers show a Base URL field. */
  defaultBaseUrl?: string;
  /** False for a provider that works without a key (a local server). Absent means a key is required. */
  requiresKey?: boolean;
  /** `imageModels` are the static `models` known to accept images, a starting hint for Settings; discovery adds the rest. */
  text?: { models: string[]; defaultModel: string; imageModels?: string[] };
  /** An empty `voices` list means the provider takes any voice id, so Settings shows a text field instead of a select.
   * `device` declares the platform's own voice: no key, no model, no voice list, no clip. */
  speech?: {
    models: string[];
    defaultModel: string;
    voices: VoiceInfo[];
    defaultVoice: string;
    device?: boolean;
  };
}

/** A provider offers text, speech or both. */
export interface Provider {
  info: ProviderInfo;
  /** Absent means this provider does not offer model discovery. Never guess an endpoint. */
  catalogue?: ModelCatalogue;
  text?: TextProvider;
  speech?: SpeechProvider;
  assessment?: AssessmentProvider;
}
