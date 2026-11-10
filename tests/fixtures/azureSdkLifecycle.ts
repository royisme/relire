/** Real SDK resources/session/disposal, with only result delivery and the WebSocket replaced offline. */
import { mock, spyOn } from 'bun:test';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { WebsocketConnection } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.browser/WebsocketConnection';
import { WebsocketMessageFormatter } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/WebsocketMessageFormatter';
import type { ServiceRecognizerBase } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/ServiceRecognizerBase';
import type { RequestSession } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RequestSession';

// Drain a bounded number of microtasks, never wall-clock sleeps or unbounded polling.
export async function flushSdk() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

export function lifecycleClock() {
  let id = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const set = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
    timers.set(++id, { callback, delay });
    return id;
  }) as typeof setTimeout);
  const clear = spyOn(globalThis, 'clearTimeout').mockImplementation(((handle: number) => {
    timers.delete(handle);
  }) as typeof clearTimeout);
  return {
    fire(delay: number) {
      let count = 0;
      for (const [handle, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(handle);
        timer.callback();
        count++;
      }
      return count;
    },
    restore() {
      set.mockRestore();
      clear.mockRestore();
    },
  };
}

export function realAzureSdk(stalled = false) {
  const websocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  class OfflineSocket {
    onopen?: () => void;
    onclose?: (event: { code: number; reason: string }) => void;
    readyState = 1;
    send = mock((_data: unknown) => {});
    close = mock(() => {}); // The test withholds the close event to prove admission awaits transport release.
    constructor(_url: string) {
      sockets.push(this);
      queueMicrotask(() => this.onopen!());
    }
    release() {
      this.readyState = 3;
      this.onclose!({ code: 1000, reason: 'TEST offline close' });
    }
  }
  const sockets: OfflineSocket[] = [];
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: OfflineSocket });
  const restores: (() => void)[] = [];
  function track<T extends { close: (...args: never[]) => unknown }>(resource: T) {
    const close = spyOn(resource, 'close');
    restores.push(() => close.mockRestore());
    return close;
  }
  const streams: ReturnType<typeof sdk.AudioInputStream.createPushStream>[] = [];
  const streamCloses: ReturnType<typeof track>[] = [];
  const streamFactory = spyOn(sdk.AudioInputStream, 'createPushStream');
  const originalStreamFactory = streamFactory.getMockImplementation()!;
  streamFactory.mockImplementation((format) => {
    const stream = originalStreamFactory(format);
    streams.push(stream);
    streamCloses.push(track(stream));
    return stream;
  });
  restores.push(() => streamFactory.mockRestore());
  const recognizers: OfflineRecognizer[] = [];
  class OfflineRecognizer extends sdk.SpeechRecognizer {
    success?: (result: sdk.SpeechRecognitionResult) => void;
    error?: (message: string) => void;
    service: Pick<ServiceRecognizerBase, 'isDisposed'> & {
      privRequestSession: RequestSession;
      privConnectionPromise?: Promise<WebsocketConnection>;
      fetchConnection: () => Promise<WebsocketConnection>;
    };
    connection?: WebsocketConnection;
    audioClose: ReturnType<typeof track>;
    formatClose: ReturnType<typeof track>;
    speechClose: ReturnType<typeof track>;
    constructor(speech: sdk.SpeechConfig, audio: sdk.AudioConfig) {
      super(speech, audio);
      this.service = this.internalData as unknown as OfflineRecognizer['service'];
      this.audioClose = track(audio);
      this.speechClose = track(speech);
      // The actual stream format is shared by the AudioConfig wrapper and the recognizer.
      this.formatClose = track((streams.at(-1) as unknown as { privFormat: sdk.AudioStreamFormat }).privFormat);
      recognizers.push(this);
    }
    override recognizeOnceAsync(
      success?: (result: sdk.SpeechRecognitionResult) => void,
      error?: (message: string) => void,
    ) {
      this.success = success;
      this.error = error;
      if (!stalled) return;
      const session = this.service.privRequestSession;
      session.startNewRecognition();
      session.onServiceTurnStartResponse(); // Real turn.start state; deliberately no turn.end.
      this.connection = new WebsocketConnection(
        'wss://offline.invalid',
        {},
        {},
        new WebsocketMessageFormatter(),
        undefined!,
      );
      const connection = this.connection;
      this.service.privConnectionPromise = connection.open().then(() => connection);
      const fetch = spyOn(this.service, 'fetchConnection').mockImplementation(
        () => this.service.privConnectionPromise!,
      );
      restores.push(() => fetch.mockRestore());
    }
  }
  return {
    sdk: { ...sdk, SpeechRecognizer: OfflineRecognizer },
    recognizers,
    streamCloses,
    sockets,
    async restore() {
      // Recover even on the unfixed implementation, so a failed regression cannot poison the module queue.
      for (let pass = 0; pass < 3; pass++) {
        for (const recognizer of recognizers) {
          await recognizer.service.privRequestSession.onServiceTurnEndResponse(false);
          recognizer.success?.(new sdk.SpeechRecognitionResult('TEST', sdk.ResultReason.NoMatch));
        }
        for (const socket of sockets) if (socket.readyState !== 3) socket.release();
        await flushSdk();
      }
      for (const restore of restores.reverse()) restore();
      if (websocketDescriptor) Object.defineProperty(globalThis, 'WebSocket', websocketDescriptor);
      else Reflect.deleteProperty(globalThis, 'WebSocket');
    },
  };
}

export function realAssessmentResult() {
  const properties = new sdk.PropertyCollection();
  properties.setProperty(
    sdk.PropertyId.SpeechServiceResponse_JsonResult,
    JSON.stringify({
      NBest: [{ PronunciationAssessment: { PronScore: 0, AccuracyScore: 0, FluencyScore: 0 } }],
    }),
  );
  return new sdk.SpeechRecognitionResult(
    'TEST',
    sdk.ResultReason.RecognizedSpeech,
    'Bonjour.',
    0,
    0,
    '',
    '',
    '',
    '',
    '',
    properties,
  );
}
