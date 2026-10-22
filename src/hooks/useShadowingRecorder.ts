import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PronunciationAssessment } from '../types';
import { assessPronunciation } from '../services/api';
import { errorMessage } from '../services/ai/errors';
import { getAppSettings } from '../utils/appSettings';
import { FrenchAudioRecorder, stopSpeech } from '../utils/speech';
import { CaptureBusyError } from '../utils/speech/recorder';

/**
 * The record, review and score flow for reading one sentence aloud. Owns the microphone, the
 * recording and the assessment so screens only draw them. Changing `referenceText` starts over.
 */

export type RecorderPhase = 'idle' | 'recording' | 'recorded';

/** `busy`: the reader's practice card holds the microphone. */
export type RecorderError = { kind: 'mic' } | { kind: 'busy' } | { kind: 'assess'; detail: string };

interface Recording {
  blob: Blob;
  base64: string;
  mimeType: string;
}

/** The part of the Web Speech API this hook uses; Chrome still ships it prefixed. */
interface Recognizer {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognizerClass = new () => Recognizer;

export function useShadowingRecorder(
  referenceText: string,
  onAssessed?: (assessment: PronunciationAssessment, sentence: string) => void,
) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<RecorderError | null>(null);

  const recorder = useRef<FrenchAudioRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const transcript = useRef('');
  const recording = useRef<Recording | null>(null);
  const urlRef = useRef<string | null>(null);
  /** Cancels the in-flight assessment when the session is invalidated. */
  const assessAbort = useRef<AbortController | null>(null);
  /** Bumped on every reset, so work that finishes for an earlier sentence is dropped. */
  const session = useRef(0);
  const onAssessedRef = useRef(onAssessed);
  useLayoutEffect(() => {
    onAssessedRef.current = onAssessed;
  });

  const releaseResources = useCallback(() => {
    window.clearInterval(timer.current);
    recognition.current?.stop();
    recognition.current = null;
    // Closes the microphone if a recording is still running.
    void recorder.current?.stop();
    recorder.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  // Ends whatever the previous sentence left running; work that finishes for it is dropped.
  const invalidate = useCallback(() => {
    session.current++;
    assessAbort.current?.abort();
    assessAbort.current = null;
    releaseResources();
    recording.current = null;
    transcript.current = '';
  }, [releaseResources]);

  // A new sentence starts from nothing (adjusted during render, so no stale frame shows)...
  const [shownFor, setShownFor] = useState(referenceText);
  if (shownFor !== referenceText) {
    setShownFor(referenceText);
    setPhase('idle');
    setSeconds(0);
    setAudioUrl(null);
    setAssessment(null);
    setIsEvaluating(false);
    setError(null);
  }
  // ...and leaving it, or the screen, closes the microphone.
  useEffect(() => invalidate, [referenceText, invalidate]);

  const start = useCallback(async () => {
    stopSpeech();
    setAssessment(null);
    setError(null);
    const mine = ++session.current;

    const rec = new FrenchAudioRecorder();
    let ok: boolean;
    try {
      // Another screen's "stop" ends this recording without keeping it.
      ok = await rec.start(() => {
        if (mine !== session.current) return;
        window.clearInterval(timer.current);
        recognition.current?.stop();
        recognition.current = null;
        recorder.current = null;
        setPhase('idle');
      });
    } catch (err) {
      if (mine === session.current) setError(err instanceof CaptureBusyError ? { kind: 'busy' } : { kind: 'mic' });
      return;
    }
    if (mine !== session.current) {
      void rec.stop();
      return;
    }
    if (!ok) {
      setError({ kind: 'mic' });
      return;
    }
    recorder.current = rec;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    recording.current = null;
    setAudioUrl(null);
    setPhase('recording');
    setSeconds(0);
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

    // Where the browser can, a transcript helps the scorer; it is optional and only runs on opt-in. Read
    // now, not at import, so a setting saved in another tab applies to the next recording.
    transcript.current = '';
    if (!getAppSettings().practiceBrowserRecognition) return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: RecognizerClass;
      webkitSpeechRecognition?: RecognizerClass;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (Recognition) {
      try {
        const r = new Recognition();
        r.lang = 'fr-FR';
        r.interimResults = false;
        r.onresult = (evt) => {
          if (mine === session.current) transcript.current = evt.results[0][0].transcript;
        };
        r.start();
        recognition.current = r;
      } catch {
        // Unsupported or already running; scoring works from the audio alone.
      }
    }
  }, []);

  const stop = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    const mine = session.current;
    window.clearInterval(timer.current);
    recognition.current?.stop();
    recognition.current = null;
    recorder.current = null;

    const result = await rec.stop();
    if (mine !== session.current) return;
    if (!result) {
      setPhase('idle');
      return;
    }
    const url = URL.createObjectURL(result.blob);
    urlRef.current = url;
    recording.current = { blob: result.blob, base64: result.base64, mimeType: result.mimeType };
    setAudioUrl(url);
    setPhase('recorded');
  }, []);

  const assess = useCallback(async () => {
    const mine = session.current;
    const controller = new AbortController();
    assessAbort.current = controller;
    setIsEvaluating(true);
    setError(null);
    try {
      const res = await assessPronunciation({
        referenceText,
        audio: recording.current?.blob,
        audioBase64: recording.current?.base64,
        mimeType: recording.current?.mimeType,
        userTranscript: transcript.current || undefined,
        signal: controller.signal,
      });
      if (mine !== session.current) return;
      setAssessment(res);
      onAssessedRef.current?.(res, referenceText);
    } catch (err) {
      if (mine !== session.current) return;
      console.error('Assessment failed:', err);
      setError({ kind: 'assess', detail: errorMessage(err) });
    } finally {
      if (assessAbort.current === controller) assessAbort.current = null;
      if (mine === session.current) setIsEvaluating(false);
    }
  }, [referenceText]);

  return { phase, seconds, audioUrl, assessment, isEvaluating, error, start, stop, assess };
}
