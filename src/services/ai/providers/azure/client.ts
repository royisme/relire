/** Browser-direct Azure assessment/checks. One local queue, no retries, microphone or endpoint override. */
import type {
  AudioConfig,
  AudioStreamFormat,
  PushAudioInputStream,
  SpeechConfig,
  SpeechRecognizer,
  SpeechRecognitionResult,
} from 'microsoft-cognitiveservices-speech-sdk';
import i18n from '../../../../i18n';
import { loadAzureSdk } from '../../../assessment/azureSdk';
import { ASSESSMENT_SAMPLE_RATE } from '../../../../utils/speech/pcm';
import { errorMessage, MissingApiKeyError } from '../../errors';
import type { AssessmentConfig, AssessmentProvider, AssessmentRequest } from '../../types';
import { normalizeAzureRegion } from './region';
import { mapAzureResult } from './result';

const cancelled = () => new DOMException('The request was cancelled.', 'AbortError');
// This limits this browser module only, not other tabs/devices sharing an Azure resource.
let tail: Promise<void> = Promise.resolve();

function serial<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(cancelled());
  const pending = tail.then(() => {
    if (signal?.aborted) throw cancelled();
    return run();
  });
  // An early abort rejects the caller immediately, but the queue still waits for active SDK cleanup.
  tail = pending.then(
    () => undefined,
    () => undefined,
  );
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal?.addEventListener('abort', abort, { once: true });
    pending.then(
      (value) => {
        signal?.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function credentials(config: AssessmentConfig): AssessmentConfig {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new MissingApiKeyError();
  const region = normalizeAzureRegion(config.region);
  if (!region) throw new Error(i18n.t('azureAssessment.invalidRegion'));
  return { apiKey, region };
}

async function recognize(request: AssessmentRequest, config: AssessmentConfig, check: boolean) {
  const sdk = await loadAzureSdk();
  if (request.signal?.aborted) throw cancelled();
  let speech: SpeechConfig | undefined;
  let format: AudioStreamFormat | undefined;
  let stream: PushAudioInputStream | undefined;
  let audio: AudioConfig | undefined;
  let recognizer: SpeechRecognizer | undefined;
  let streamClosed = false;
  let operationError: unknown;
  let outcome: ReturnType<typeof mapAzureResult> | undefined;
  const closeStream = () => {
    if (stream && !streamClosed) {
      streamClosed = true;
      stream.close();
    }
  };
  try {
    speech = sdk.SpeechConfig.fromSubscription(config.apiKey, config.region);
    speech.speechRecognitionLanguage = request.locale;
    format = sdk.AudioStreamFormat.getWaveFormatPCM(ASSESSMENT_SAMPLE_RATE, 16, 1);
    stream = sdk.AudioInputStream.createPushStream(format);
    audio = sdk.AudioConfig.fromStreamInput(stream);
    recognizer = new sdk.SpeechRecognizer(speech, audio);
    if (!check) {
      const assessment = new sdk.PronunciationAssessmentConfig(
        request.referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Word,
        true,
      );
      assessment.applyTo(recognizer);
    }
    outcome = await new Promise<ReturnType<typeof mapAzureResult> | undefined>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: unknown, value?: ReturnType<typeof mapAzureResult>) => {
        if (settled) return;
        settled = true;
        request.signal?.removeEventListener('abort', abort);
        clearTimeout(timer);
        if (error !== undefined) reject(error);
        else resolve(value);
      };
      const abort = () => finish(cancelled());
      const result = (value: SpeechRecognitionResult) => {
        if (settled) return;
        try {
          if (value.reason === sdk.ResultReason.Canceled) {
            const detail = sdk.CancellationDetails.fromResult(value);
            throw new Error(
              i18n.t('azureAssessment.canceled', {
                reason: detail.errorDetails || sdk.CancellationReason[detail.reason],
                code: sdk.CancellationErrorCode[detail.ErrorCode],
              }),
            );
          }
          if (value.reason === sdk.ResultReason.NoMatch) {
            if (check) return finish();
            throw new Error(
              i18n.t('azureAssessment.noMatch', {
                reason: sdk.NoMatchReason[sdk.NoMatchDetails.fromResult(value).reason],
              }),
            );
          }
          if (value.reason !== sdk.ResultReason.RecognizedSpeech)
            throw new Error(i18n.t('azureAssessment.unexpectedResult', { reason: sdk.ResultReason[value.reason] }));
          if (check) return finish();
          finish(
            undefined,
            mapAzureResult(
              sdk.PronunciationAssessmentResult.fromResult(value).detailResult,
              value.text,
              request.referenceText,
            ),
          );
        } catch (error) {
          finish(error);
        }
      };
      request.signal?.addEventListener('abort', abort, { once: true });
      if (request.signal?.aborted) return abort();
      // There is no auth-only SDK operation: Check sends 100 ms of silence, bounded by a local timeout.
      if (check) timer = setTimeout(() => finish(new Error(i18n.t('azureAssessment.checkTimeout'))), 15000);
      try {
        recognizer!.recognizeOnceAsync(result, (error) => finish(new Error(error)));
        if (settled) return;
        // Copy only this view, not adjacent samples in its backing buffer. No WAV header.
        stream!.write(
          new Uint8Array(request.pcm.buffer, request.pcm.byteOffset, request.pcm.byteLength).slice().buffer,
        );
        closeStream();
      } catch (error) {
        finish(error);
      }
    });
  } catch (error) {
    operationError = request.signal?.aborted ? cancelled() : new Error(errorMessage(error, config.apiKey));
  } finally {
    // Wait for recognizer disposal before admitting the next operation, including after cancellation.
    const resources: (() => void | Promise<void>)[] = [
      () => (recognizer ? new Promise<void>((resolve, reject) => recognizer!.close(resolve, reject)) : undefined),
      closeStream,
      () => audio?.close(),
      () => format?.close(),
      () => speech?.close(),
    ];
    for (const close of resources) {
      try {
        const closing = close();
        if (closing) await closing;
      } catch (error) {
        operationError ??= new Error(errorMessage(error, config.apiKey));
      }
    }
  }
  if (operationError !== undefined) throw operationError;
  return outcome;
}

export const azureAssessment: AssessmentProvider = {
  async assess(request, config) {
    if (request.signal?.aborted) throw cancelled();
    const pinned = credentials(config);
    if (!request.pcm.length || !request.referenceText.trim()) throw new Error(i18n.t('azureAssessment.emptyInput'));
    const result = await serial(() => recognize(request, pinned, false), request.signal);
    // Only the connectivity check accepts a successful recognition without scores.
    if (!result) throw new Error(i18n.t('azureAssessment.emptyResult'));
    return result;
  },
  async checkKey(config, signal) {
    if (signal?.aborted) throw cancelled();
    const pinned = credentials(config);
    await serial(
      () =>
        recognize(
          {
            pcm: new Int16Array(ASSESSMENT_SAMPLE_RATE / 10),
            referenceText: '',
            locale: 'fr-FR',
            signal,
          },
          pinned,
          true,
        ),
      signal,
    );
  },
};
