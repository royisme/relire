/** Offline wire transport; recognition, connection factory, receive loop and disposal stay real. */
import { mock, spyOn } from 'bun:test';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import type { ServiceRecognizerBase } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/ServiceRecognizerBase';
import type { RequestSession } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/RequestSession';
import { flushSdk } from './azureSdkLifecycle';

export function transportAzureSdk() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  // Set before the request: every transport then closes before opening, as a refused connection does.
  let openFailure: number | undefined;
  const recognizers: TrackingRecognizer[] = [];
  const sockets: OfflineSocket[] = [];
  const restores: (() => void)[] = [];
  function track<T extends { close: (...args: never[]) => unknown }>(resource: T) {
    const close = spyOn(resource, 'close');
    restores.push(() => close.mockRestore());
    return close;
  }
  const streams: { close: ReturnType<typeof track>; formatClose: ReturnType<typeof track> }[] = [];
  const createStream = sdk.AudioInputStream.createPushStream.bind(sdk.AudioInputStream);
  const streamFactory = spyOn(sdk.AudioInputStream, 'createPushStream').mockImplementation((format) => {
    const stream = createStream(format);
    streams.push({ close: track(stream), formatClose: track(format!) });
    return stream;
  });
  restores.push(() => streamFactory.mockRestore());
  class TrackingRecognizer extends sdk.SpeechRecognizer {
    readonly service: Pick<ServiceRecognizerBase, 'isDisposed'> & { privRequestSession: RequestSession };
    readonly audioClose: ReturnType<typeof track>;
    readonly speechClose: ReturnType<typeof track>;
    constructor(speech: sdk.SpeechConfig, audio: sdk.AudioConfig) {
      super(speech, audio);
      this.service = this.internalData as unknown as TrackingRecognizer['service'];
      this.audioClose = track(audio);
      this.speechClose = track(speech);
      recognizers.push(this);
    }
  }
  class OfflineSocket {
    readonly owner = recognizers.length - 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number; reason: string }) => void;
    readonly OPEN = 1;
    readyState = 1;
    send = mock((_data: unknown) => {});
    close = mock(() => {});
    constructor(_url: string) {
      sockets.push(this);
      queueMicrotask(() => (openFailure === undefined ? this.onopen!() : this.release(openFailure)));
    }
    get requestId() {
      const context = this.send.mock.calls
        .map(([data]) => data)
        .find((data): data is string => typeof data === 'string' && /path: speech.context/i.test(data));
      if (!context) throw new Error('TEST missing real SDK speech.context');
      const id = /x-requestid: ([^\r\n]+)/i.exec(context)?.[1];
      if (!id) throw new Error('TEST missing real SDK request id');
      return id;
    }
    message(path: string, body: unknown = {}, requestId = this.requestId) {
      this.onmessage!({
        data: `Path: ${path}\r\nX-RequestId: ${requestId}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}`,
      });
    }
    release(code = 1000) {
      this.readyState = 3;
      this.onclose!({ code, reason: 'TEST offline close' });
    }
    phrase(status = 'Success', endTurn = true) {
      this.message('speech.phrase', {
        RecognitionStatus: status,
        DisplayText: 'Bonjour.',
        Offset: 0,
        Duration: 10000,
        NBest: [
          {
            Display: 'Bonjour.',
            Words: [],
            PronunciationAssessment: { PronScore: 0, AccuracyScore: 0, FluencyScore: 0 },
          },
        ],
      });
      if (endTurn) this.message('turn.end');
    }
  }
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: OfflineSocket });
  return {
    sdk: { ...sdk, SpeechRecognizer: TrackingRecognizer },
    recognizers,
    sockets,
    streams,
    snapshot() {
      return {
        recognizers: recognizers.length,
        transports: sockets.map((socket) => socket.owner),
        live: sockets.filter((socket) => socket.readyState !== 3).map((socket) => socket.owner),
        disposed: recognizers.map((recognizer) => recognizer.service.isDisposed()),
      };
    },
    setOpenFailure(code?: number) {
      openFailure = code;
    },
    async restore() {
      try {
        // Drain real turns/connections even after a red assertion, so the provider queue cannot leak across tests.
        for (let pass = 0; pass < 6; pass++) {
          for (const socket of [...sockets]) {
            if (socket.readyState === 3) continue;
            if (
              socket.send.mock.calls.some(([data]) => typeof data === 'string' && /path: speech.context/i.test(data))
            ) {
              socket.phrase('NoMatch');
            }
          }
          await flushSdk();
          for (const socket of [...sockets]) if (socket.readyState !== 3) socket.release();
          await flushSdk();
        }
      } finally {
        for (const restore of restores.reverse()) restore();
        if (descriptor) Object.defineProperty(globalThis, 'WebSocket', descriptor);
        else Reflect.deleteProperty(globalThis, 'WebSocket');
      }
    },
  };
}
