/**
 * The reader's practice card: one sentence at a time, record → save → listen
 * back. Owns the capture claim, the microphone stream, the running take, the
 * save and every late-result guard; the card component only draws this state.
 * See docs/shadowing-log-design.md (Recording flow).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readerIdentity, type RecordableReaderSource as ReaderSource } from '../types/readerSource';
import type { ShadowingTake } from '../types/shadowing';
import type { PronunciationAssessment } from '../types';
import { assessPronunciation } from '../services/api';
import { blobToBase64 } from '../utils/binary';
import { addTake, ArticleGoneError, getShadowingSentence, subscribeShadowing } from '../storage/shadowing';
import { errorMessage } from '../services/ai/errors';
import {
  acquireStream,
  CaptureBusyError,
  claimCapture,
  releaseCapture,
  releaseStream,
  Take,
  type TakeResult,
} from '../utils/speech/recorder';
import {
  getSequenceState,
  playRecording,
  setBeforePlay,
  speakFrench,
  stopSpeech,
  suspendSequence,
} from '../utils/speech';
import { getSpeechState, speechKey } from '../utils/speech/state';

export type CardPhase = 'closed' | 'acquiring' | 'recording' | 'saving' | 'ready' | 'unsaved';
export type CardNotice = 'saved' | 'tooShort' | 'listeningEnded' | 'busy' | null;

export interface PracticeTarget {
  source: ReaderSource;
  passageContent?: string;
  /** Sentence id in the reader, to return focus and highlight. */
  sentenceId: string;
  text: string;
}

const MIN_TAKE_MS = 500;
const MAX_TAKE_MS = 60_000;
export const takeKey = (take: ShadowingTake) => `take:${take.id}`;

/** `playbackEngine: 'device'` speaks the reference (and compare's first step) with the device's own voice
 * instead of the selected engine: nothing is synthesized, stored or fetched. The learner's own recordings
 * always play through `playRecording`. */
export function usePracticeCard(
  onAssessed?: (assessment: PronunciationAssessment, sentence: string) => void,
  playbackEngine?: 'device',
) {
  const [phase, setPhase] = useState<CardPhase>('closed');
  const [target, setTarget] = useState<PracticeTarget | null>(null);
  const [latest, setLatest] = useState<ShadowingTake | null>(null);
  const [count, setCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<CardNotice>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const assessAbort = useRef<AbortController | null>(null);
  const latestRef = useRef(latest);
  const onAssessedRef = useRef(onAssessed);
  useLayoutEffect(() => {
    onAssessedRef.current = onAssessed;
    latestRef.current = latest;
  });
  const cancelAssessment = useCallback(() => {
    assessAbort.current?.abort();
    assessAbort.current = null;
    setAssessment(null);
    setAssessmentError(null);
    setIsEvaluating(false);
  }, []);

  // Bumped on close, switch, redo and cancel: async results from an older take are ignored.
  const session = useRef(0);
  const phaseRef = useRef<CardPhase>('closed');
  const targetRef = useRef<PracticeTarget | null>(null);
  /** `stop`, for the take timer that is set up before `stop` exists. */
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const token = useRef<symbol | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const take = useRef<Take | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const unsaved = useRef<{ target: PracticeTarget; result: TakeResult } | null>(null);
  /** Keys of sounds this card started, so closing it stops only its own playback. */
  const owned = useRef(new Set<string>());
  const analyser = useRef<{ context: AudioContext; node: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);

  const go = (next: CardPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /** Stops the take (discarding it), the meter, the stream and the claim. Synchronous and idempotent. */
  const releaseCaptureNow = useCallback(() => {
    window.clearInterval(timer.current);
    take.current?.cancel();
    take.current = null;
    void analyser.current?.context.close().catch(() => undefined);
    analyser.current = null;
    releaseStream(stream.current);
    stream.current = null;
    releaseCapture(token.current);
    token.current = null;
  }, []);

  const loadLatest = useCallback(
    async (of: PracticeTarget) => {
      try {
        const record = await getShadowingSentence(of.source, of.text);
        if (targetRef.current !== of) return;
        const next = record?.takes.at(-1) ?? null;
        if (next?.id !== latestRef.current?.id) cancelAssessment();
        setLatest(next);
        setCount(record?.takes.length ?? 0);
      } catch (err) {
        if (targetRef.current === of) setError(errorMessage(err));
      }
    },
    [cancelAssessment],
  );

  /** Ends any capture and returns to `ready` on the same sentence, with an optional notice. */
  const toReady = useCallback(
    (why: CardNotice = null) => {
      session.current++;
      releaseCaptureNow();
      go('ready');
      setNotice(why);
    },
    [releaseCaptureNow],
  );

  const startTake = useCallback(async () => {
    const mine = ++session.current;
    cancelAssessment();
    setError(null);
    setNotice(null);
    setElapsedMs(0);
    // Hold an article in place instead of ending it; stop any single sentence that plays.
    if (getSequenceState().id) suspendSequence();
    else if (getSpeechState().phase !== 'idle') stopSpeech();
    try {
      // Claimed before the permission prompt: a pending prompt already owns capture.
      token.current = claimCapture('card', () => toReady());
    } catch (err) {
      go('ready');
      if (err instanceof CaptureBusyError) setNotice('busy');
      else setError(errorMessage(err));
      return;
    }
    go('acquiring');
    try {
      const opened = await acquireStream();
      if (mine !== session.current) {
        // Cancelled while the prompt was open: never keep a late stream.
        releaseStream(opened);
        return;
      }
      stream.current = opened;
      take.current = new Take(opened);
      try {
        const context = new AudioContext();
        const node = context.createAnalyser();
        node.fftSize = 256;
        context.createMediaStreamSource(opened).connect(node);
        analyser.current = { context, node, data: new Uint8Array(new ArrayBuffer(node.frequencyBinCount)) };
      } catch {
        // The level meter is decoration; recording works without it.
      }
      go('recording');
      const started = performance.now();
      timer.current = window.setInterval(() => {
        const elapsed = performance.now() - started;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_TAKE_MS) void stopRef.current();
      }, 200);
    } catch (err) {
      if (mine !== session.current) return;
      releaseCaptureNow();
      go('ready');
      setError(errorMessage(err));
    }
  }, [cancelAssessment, releaseCaptureNow, toReady]);

  const save = useCallback(
    async (of: PracticeTarget, result: TakeResult, mine: number) => {
      go('saving');
      try {
        const record = await addTake(of.source, of.text, result, of.passageContent);
        unsaved.current = null;
        if (mine !== session.current) return;
        setLatest(record.takes.at(-1) ?? null);
        setCount(record.takes.length);
        go('ready');
        setNotice('saved');
      } catch (err) {
        if (err instanceof ArticleGoneError) {
          unsaved.current = null;
          if (mine === session.current) toReady();
          return;
        }
        unsaved.current = { target: of, result };
        if (mine !== session.current) return;
        go('unsaved');
        setError(errorMessage(err));
      }
    },
    [toReady],
  );

  /** Stop pressed (or 60 s reached): the target is fixed now, and the save completes even if the card closes. */
  const stop = useCallback(async () => {
    const running = take.current;
    const of = targetRef.current;
    if (!running || !of || phaseRef.current !== 'recording') return;
    const mine = session.current;
    window.clearInterval(timer.current);
    take.current = null;
    let result: TakeResult;
    try {
      result = await running.stop();
    } catch (err) {
      releaseCaptureNow();
      if (mine !== session.current) return;
      go('ready');
      setError(errorMessage(err));
      return;
    }
    releaseCaptureNow();
    if (result.durationMs < MIN_TAKE_MS || result.blob.size === 0) {
      if (mine === session.current) toReady('tooShort');
      return;
    }
    await save(of, result, mine);
  }, [releaseCaptureNow, save, toReady]);
  useLayoutEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  /** Opens the card on a sentence and records at once; refused while a take is in progress. */
  const open = useCallback(
    (next: PracticeTarget) => {
      const busy = ['acquiring', 'recording', 'saving', 'unsaved'].includes(phaseRef.current);
      if (busy) return false;
      const same =
        targetRef.current &&
        readerIdentity(targetRef.current.source) === readerIdentity(next.source) &&
        targetRef.current.text === next.text;
      const of = same ? targetRef.current! : next;
      if (!same) {
        targetRef.current = of;
        setTarget(of);
        setLatest(null);
        setCount(0);
        void loadLatest(of);
      }
      void startTake();
      return true;
    },
    [loadLatest, startTake],
  );

  const redo = useCallback(() => {
    const of = targetRef.current;
    if (!of || phaseRef.current !== 'recording') return;
    session.current++;
    releaseCaptureNow();
    void startTake();
  }, [releaseCaptureNow, startTake]);

  const retrySave = useCallback(() => {
    const pending = unsaved.current;
    if (!pending || phaseRef.current !== 'unsaved') return;
    setError(null);
    void save(pending.target, pending.result, session.current);
  }, [save]);

  const discardUnsaved = useCallback(() => {
    unsaved.current = null;
    setError(null);
    toReady();
  }, [toReady]);

  /** Closes the card; a running take is discarded, a save in flight still completes. */
  const close = useCallback(() => {
    session.current++;
    cancelAssessment();
    releaseCaptureNow();
    unsaved.current = null;
    const { key } = getSpeechState();
    // The card's own playback ends with it (compare's second step is guarded by the session).
    if (key && owned.current.has(key)) stopSpeech();
    owned.current.clear();
    targetRef.current = null;
    setTarget(null);
    setLatest(null);
    setCount(0);
    setError(null);
    setNotice(null);
    go('closed');
  }, [cancelAssessment, releaseCaptureNow]);

  /** A sheet or another sound takes over: discard a take in progress, keep the card. */
  const interrupt = useCallback(() => {
    if (phaseRef.current === 'acquiring' || phaseRef.current === 'recording') toReady();
  }, [toReady]);

  // Any sound started elsewhere ends a running take before it plays.
  useEffect(() => {
    setBeforePlay(interrupt);
    return () => setBeforePlay(null);
  }, [interrupt]);

  // Leaving the reader releases everything.
  useEffect(
    () => () => {
      session.current++;
      assessAbort.current?.abort();
      releaseCaptureNow();
    },
    [releaseCaptureNow],
  );

  // Recordings deleted in the log update the card's latest take.
  useEffect(
    () =>
      subscribeShadowing(() => {
        if (targetRef.current) void loadLatest(targetRef.current);
      }),
    [loadLatest],
  );

  const endsListening = () => {
    if (getSequenceState().id) setNotice('listeningEnded');
  };
  const playReference = () => {
    const of = targetRef.current;
    if (!of || phaseRef.current !== 'ready') return;
    endsListening();
    owned.current.add(speechKey(of.text));
    void speakFrench(of.text, { engine: playbackEngine });
  };
  const playLatest = () => {
    if (!latest || phaseRef.current !== 'ready') return;
    endsListening();
    owned.current.add(takeKey(latest));
    void playRecording(latest.blob, takeKey(latest));
  };
  /** Reference, then the latest take; anything else that plays cancels the second step. */
  const compare = () => {
    const of = targetRef.current;
    const mine = latest;
    if (!of || !mine || phaseRef.current !== 'ready') return;
    endsListening();
    owned.current.add(speechKey(of.text)).add(takeKey(mine));
    const card = session.current;
    void speakFrench(of.text, {
      engine: playbackEngine,
      onSettled: (outcome) => {
        if (outcome === 'ended' && card === session.current && targetRef.current === of)
          void playRecording(mine.blob, takeKey(mine));
      },
    });
  };

  /** One Check per request; a new capture or closed session makes even a non-aborting provider silent. */
  const assess = async () => {
    const of = targetRef.current;
    if (!of || !latest || phaseRef.current !== 'ready' || assessAbort.current) return;
    const mine = session.current;
    const controller = new AbortController();
    assessAbort.current = controller;
    setIsEvaluating(true);
    setAssessmentError(null);
    try {
      const audioBase64 = await blobToBase64(latest.blob);
      if (controller.signal.aborted || mine !== session.current) return;
      const result = await assessPronunciation({
        referenceText: of.text,
        audio: latest.blob,
        audioBase64,
        mimeType: latest.mimeType,
        signal: controller.signal,
      });
      if (controller.signal.aborted || mine !== session.current) return;
      setAssessment(result);
      onAssessedRef.current?.(result, of.text);
    } catch (err) {
      if (controller.signal.aborted || mine !== session.current) return;
      setAssessmentError(errorMessage(err));
    } finally {
      if (assessAbort.current === controller) assessAbort.current = null;
      if (mine === session.current) setIsEvaluating(false);
    }
  };

  /** 0..1 input level for the meter, read on animation frames by the card. */
  const level = () => {
    const meter = analyser.current;
    if (!meter) return 0;
    meter.node.getByteTimeDomainData(meter.data);
    let peak = 0;
    for (const value of meter.data) peak = Math.max(peak, Math.abs(value - 128));
    return Math.min(1, peak / 64);
  };

  return {
    phase,
    target,
    latest,
    count,
    elapsedMs,
    error,
    notice,
    assessment,
    assessmentError,
    isEvaluating,
    assess,
    open,
    stop,
    redo,
    close,
    retrySave,
    discardUnsaved,
    interrupt,
    playReference,
    playLatest,
    compare,
    level,
  };
}

export type PracticeCardController = ReturnType<typeof usePracticeCard>;
