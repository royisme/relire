/** Test-only SDK seam. No runtime SDK import, network, microphone or browser global replacement. */
import { mock } from 'bun:test';
import type { loadAzureSdk } from '../../src/services/assessment/azureSdk';

type Result = {
  reason: number;
  text?: string;
  detail?: unknown;
  cancellation?: { errorDetails: string; reason: number; ErrorCode: number };
};
export const recognized = (
  detail: unknown = {
    PronunciationAssessment: { PronScore: 72, AccuracyScore: 70, FluencyScore: 74 },
  },
): Result => ({ reason: 3, text: 'Bonjour.', detail });

export function mockAzureSdk() {
  const speechConfigs: {
    apiKey: string;
    region: string;
    speechRecognitionLanguage: string;
    close: ReturnType<typeof mock>;
  }[] = [];
  const formats: { close: ReturnType<typeof mock> }[] = [];
  const streams: { write: ReturnType<typeof mock>; close: ReturnType<typeof mock> }[] = [];
  const audioConfigs: { close: ReturnType<typeof mock> }[] = [];
  const assessments: {
    reference: string;
    grading: number;
    granularity: number;
    miscue: boolean;
    applyTo: ReturnType<typeof mock>;
  }[] = [];
  let deferClose = false;
  let constructionError: Error | undefined;
  class Recognizer {
    success?: (result: Result) => void;
    error?: (error: string) => void;
    closed?: () => void;
    closeFailed?: (error: string) => void;
    recognizeOnceAsync = mock((success: (result: Result) => void, error: (error: string) => void) => {
      this.success = success;
      this.error = error;
    });
    close = mock((success: () => void, error: (error: string) => void) => {
      this.closed = success;
      this.closeFailed = error;
      if (!deferClose) success();
    });
    constructor(
      readonly speech: unknown,
      readonly audio: unknown,
    ) {
      if (constructionError) throw constructionError;
      recognizers.push(this);
    }
  }
  const recognizers: Recognizer[] = [];
  const sdk = {
    SpeechConfig: {
      fromSubscription: mock((apiKey: string, region: string) => {
        const config = { apiKey, region, speechRecognitionLanguage: '', close: mock(() => {}) };
        speechConfigs.push(config);
        return config;
      }),
    },
    AudioStreamFormat: {
      getWaveFormatPCM: mock((_rate: number, _bits: number, _channels: number) => {
        const format = { close: mock(() => {}) };
        formats.push(format);
        return format;
      }),
    },
    AudioInputStream: {
      createPushStream: mock((_format: unknown) => {
        const stream = { write: mock((_bytes: ArrayBuffer) => {}), close: mock(() => {}) };
        streams.push(stream);
        return stream;
      }),
    },
    AudioConfig: {
      fromStreamInput: mock((_stream: unknown) => {
        const audio = { close: mock(() => {}) };
        audioConfigs.push(audio);
        return audio;
      }),
    },
    SpeechRecognizer: Recognizer,
    PronunciationAssessmentConfig: class {
      constructor(reference: string, grading: number, granularity: number, miscue: boolean) {
        const assessment = { reference, grading, granularity, miscue, applyTo: this.applyTo };
        assessments.push(assessment);
      }
      applyTo = mock((_recognizer: unknown) => {});
    },
    PronunciationAssessmentGradingSystem: { HundredMark: 2 },
    PronunciationAssessmentGranularity: { Word: 2 },
    PronunciationAssessmentResult: { fromResult: mock((result: Result) => ({ detailResult: result.detail })) },
    ResultReason: { NoMatch: 0, Canceled: 1, RecognizedSpeech: 3, 0: 'NoMatch', 1: 'Canceled', 3: 'RecognizedSpeech' },
    CancellationDetails: { fromResult: mock((result: Result) => result.cancellation) },
    CancellationReason: { 0: 'Error', 1: 'EndOfStream' },
    CancellationErrorCode: { 3: 'TooManyRequests' },
    NoMatchDetails: { fromResult: mock((_result: Result) => ({ reason: 1 })) },
    NoMatchReason: { 1: 'InitialSilenceTimeout' },
  };
  return {
    sdk: sdk as unknown as Awaited<ReturnType<typeof loadAzureSdk>>,
    calls: sdk,
    speechConfigs,
    formats,
    streams,
    audioConfigs,
    recognizers,
    assessments,
    deferClose: () => {
      deferClose = true;
    },
    failConstruction: (error: Error) => {
      constructionError = error;
    },
  };
}
