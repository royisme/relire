/**
 * Microphone recording for shadowing and pronunciation scoring. Owns the
 * microphone: one capture owner at a time (the lock), the stream session and
 * single takes. Screens never touch `getUserMedia` or `MediaRecorder`.
 */

export type CaptureOwner = 'card' | 'assessment';

/** Another part of the app holds the microphone. */
export class CaptureBusyError extends Error {
  constructor(readonly holder: CaptureOwner) {
    super(`Microphone in use by ${holder}`);
    this.name = 'CaptureBusyError';
  }
}

interface Claim {
  token: symbol;
  owner: CaptureOwner;
  cancel: () => void;
}
let claim: Claim | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * Reserves the microphone before any permission prompt, so a pending prompt
 * already owns capture. `cancel` is how another screen's "stop" action ends it.
 */
export function claimCapture(owner: CaptureOwner, cancel: () => void): symbol {
  if (claim) throw new CaptureBusyError(claim.owner);
  claim = { token: Symbol(owner), owner, cancel };
  notify();
  return claim.token;
}

/** Releases the lock if `token` still holds it; safe to call twice. */
export function releaseCapture(token: symbol | null | undefined) {
  if (!token || claim?.token !== token) return;
  claim = null;
  notify();
}

export const captureHolder = (): CaptureOwner | null => claim?.owner ?? null;

/** Asks the current holder to stop (it discards and releases). */
export function cancelCapture() {
  claim?.cancel();
}

export function subscribeCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens the microphone; throws the browser's own error (NotAllowedError, NotFoundError...). */
export function acquireStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    return Promise.reject(new DOMException('getUserMedia unavailable', 'NotSupportedError'));
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
  });
}

export function releaseStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

function preferredMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export interface TakeResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * One recording on an open stream. `stop()` resolves after the final data
 * chunk; a recorder error or a track that ends on its own (device unplugged)
 * rejects it. `cancel()` drops everything and is idempotent.
 */
export class Take {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = performance.now();
  private settled = false;
  private done: Promise<TakeResult>;
  private finish!: (result: TakeResult) => void;
  private fail!: (error: Error) => void;
  private onTrackEnded = () => this.fail(new DOMException('Microphone stopped', 'NotReadableError'));

  constructor(private stream: MediaStream) {
    const mimeType = preferredMimeType();
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.done = new Promise<TakeResult>((resolve, reject) => {
      this.finish = (result) => {
        if (this.settled) return;
        this.settled = true;
        this.detach();
        resolve(result);
      };
      this.fail = (error) => {
        if (this.settled) return;
        this.settled = true;
        this.detach();
        if (this.recorder.state !== 'inactive') this.recorder.stop();
        reject(error);
      };
    });
    // A take that is never stopped must not raise an unhandled rejection.
    this.done.catch(() => undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onerror = (event) =>
      this.fail((event as unknown as { error?: Error }).error ?? new Error('Recorder error'));
    this.recorder.onstop = () =>
      this.finish({
        blob: new Blob(this.chunks, { type: this.recorder.mimeType || mimeType || 'audio/webm' }),
        mimeType: this.recorder.mimeType || mimeType || 'audio/webm',
        durationMs: Math.round(performance.now() - this.startedAt),
      });
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', this.onTrackEnded));
    this.recorder.start(100);
  }

  private detach() {
    this.stream.getAudioTracks().forEach((track) => track.removeEventListener('ended', this.onTrackEnded));
  }

  get elapsedMs() {
    return performance.now() - this.startedAt;
  }

  stop(): Promise<TakeResult> {
    if (!this.settled && this.recorder.state !== 'inactive') this.recorder.stop();
    return this.done;
  }

  cancel() {
    if (this.settled) return;
    this.settled = true;
    this.detach();
    this.recorder.ondataavailable = null;
    this.recorder.onstop = null;
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }
}

/**
 * One-shot recorder for pronunciation scoring: holds the capture lock for the
 * whole recording, returns base64 for the assessor and always releases the mic.
 */
export class FrenchAudioRecorder {
  private stream: MediaStream | null = null;
  private take: Take | null = null;
  private token: symbol | null = null;

  /** Throws `CaptureBusyError` when the practice card holds the microphone; false when the mic fails. */
  async start(onCancel: () => void = () => undefined): Promise<boolean> {
    this.token = claimCapture('assessment', () => {
      this.cancel();
      onCancel();
    });
    try {
      this.stream = await acquireStream();
      if (!this.token) {
        releaseStream(this.stream);
        this.stream = null;
        return false;
      }
      this.take = new Take(this.stream);
      return true;
    } catch (err) {
      console.error('Microphone access failed:', err);
      this.cancel();
      return false;
    }
  }

  async stop(): Promise<{ blob: Blob; base64: string; mimeType: string } | null> {
    const take = this.take;
    if (!take) {
      this.cancel();
      return null;
    }
    try {
      const { blob, mimeType } = await take.stop();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { blob, base64, mimeType };
    } catch {
      return null;
    } finally {
      this.cancel();
    }
  }

  /** Drops the recording and releases the microphone and the lock; idempotent. */
  cancel() {
    this.take?.cancel();
    this.take = null;
    releaseStream(this.stream);
    this.stream = null;
    releaseCapture(this.token);
    this.token = null;
  }
}
