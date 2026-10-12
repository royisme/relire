/** Owns cache-only recovery, generation, cancellation and reader snapshots, never DOM geometry. */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createPronunciationSession, fetchPronunciationMarkers, getPronunciationIdentity,
  MissingApiKeyError, subscribePronunciationContext,
} from '../services/api';
import { errorMessage } from '../services/ai/errors';
import type { PronunciationLayers, PronunciationMarkers } from '../types/pronunciation';
import { MAX_PRONUNCIATION_SOURCE } from '../types/pronunciation';
import { hasUsablePronunciationMarkers, PronunciationValidationError } from '../utils/pronunciationMarkers';
import { hasGraphemeSupport, readerWords } from '../utils/readerTokens';
import type { SentencePiece } from '../utils/sentences';
import {
  getPronunciationPreferences, getSkippedSentences, savePronunciationPreferences, saveSkippedSentences,
} from '../utils/pronunciationPreferences';

export type PronunciationSnapshot = Readonly<Record<string, PronunciationMarkers>>;
interface State {
  identity: string;
  staged: PronunciationSnapshot;
  /** Sentence id → validation error; these stay plain and do not block the marker view. */
  skipped: Readonly<Record<string, string>>;
  displayed: PronunciationSnapshot;
  mode: boolean;
  layers: PronunciationLayers;
  restoring: boolean;
  running: boolean;
  stopped: boolean;
  error: string | null;
}
const empty = (identity: string, articleId: string): State => ({
  identity, staged: {}, skipped: {}, displayed: {}, mode: false, layers: getPronunciationPreferences(articleId).layers,
  restoring: true, running: false, stopped: false, error: null,
});

export function usePronunciationMarkers(articleId: string, content: string, sentences: SentencePiece[], onMissingKey: () => void) {
  const contextIdentity = useSyncExternalStore(subscribePronunciationContext, getPronunciationIdentity);
  const identity = JSON.stringify([articleId, content, contextIdentity]);
  const [stored, setStored] = useState(() => empty(identity, articleId));
  const state = stored.identity === identity ? stored : empty(identity, articleId);
  const current = useRef(state);
  current.current = state;
  const generation = useRef(0);
  const mounted = useRef(false);
  const tail = useRef<Promise<unknown> | null>(null);

  const supported = useMemo(() => sentences.filter((s) => s.text.length <= MAX_PRONUNCIATION_SOURCE), [sentences]);
  const oversized = sentences.length - supported.length;
  const capable = hasGraphemeSupport();

  useLayoutEffect(() => {
    mounted.current = true;
    const token = ++generation.current;
    const initial = empty(identity, articleId);
    current.current = initial;
    setStored(initial);
    const session = createPronunciationSession();
    const live = () => mounted.current && generation.current === token &&
      current.current.identity === identity && getPronunciationIdentity() === session.identity;
    const restore = async () => {
      const staged: Record<string, PronunciationMarkers> = {};
      const skipped: Record<string, string> = {};
      let error: string | null = null;
      try {
        if (capable) {
          for (const sentence of supported) {
            const hit = await session.getCached(sentence.text);
            if (!live()) return;
            if (hit) staged[sentence.id] = hit;
          }
          const saved = getSkippedSentences(articleId, session.identity);
          for (const sentence of supported) {
            if (!staged[sentence.id] && Object.hasOwn(saved, sentence.text)) skipped[sentence.id] = saved[sentence.text];
          }
        }
      } catch (cause) {
        error = errorMessage(cause);
      }
      if (!live()) return;
      const complete = capable && supported.length > 0 &&
        Object.keys(staged).length + Object.keys(skipped).length === supported.length &&
        Object.values(staged).some(hasUsablePronunciationMarkers);
      const mode = complete && getPronunciationPreferences(articleId).enabled;
      // Apply once on entry, never incrementally and never by issuing a provider request.
      const next = { ...current.current, staged, skipped, displayed: mode ? staged : {}, mode, restoring: false, error };
      current.current = next;
      setStored(next);
    };
    void restore();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [identity, articleId, supported, capable]);
  const ready = Object.keys(state.staged).length;
  const skippedCount = Object.keys(state.skipped).length;
  const remaining = supported.length - ready - skippedCount;
  const usable = Object.values(state.staged).some(hasUsablePronunciationMarkers);
  const changed = Object.keys(state.staged).some((id) => state.staged[id] !== state.displayed[id]);
  const canDisplay = capable && !state.restoring && !state.running && remaining === 0 && ready > 0 && usable;
  const coverage = useMemo(() => {
    const words = sentences.reduce((count, s) => count + readerWords(s.text).length, 0);
    const resolved = Object.values(state.staged).reduce((count, s) => count + s.words.filter((w) => w.status === 'resolved').length, 0);
    return { words, resolved };
  }, [sentences, state.staged]);

  const patch = (changes: Partial<State>) => {
    const next = { ...current.current, ...changes };
    current.current = next;
    setStored(next);
  };

  const stop = () => {
    generation.current++;
    patch({ running: false, stopped: true });
  };

  const run = async () => {
    if (current.current.running || current.current.restoring || !capable) return;
    const token = ++generation.current;
    const session = createPronunciationSession();
    const live = () => mounted.current && generation.current === token &&
      current.current.identity === identity && getPronunciationIdentity() === session.identity;
    patch({ running: true, stopped: false, error: null });
    let staged = { ...current.current.staged };
    let skipped = { ...current.current.skipped };
    const persistSkipped = () => saveSkippedSentences(articleId, session.identity, Object.fromEntries(
      supported.filter((sentence) => skipped[sentence.id]).map((sentence) => [sentence.text, skipped[sentence.id]])));
    const stage = (id: string, value: PronunciationMarkers) => {
      staged = { ...staged, [id]: value };
      if (skipped[id]) {
        const { [id]: _retried, ...rest } = skipped;
        skipped = rest;
        persistSkipped();
      }
      patch({ staged, skipped });
    };
    const skip = (id: string, message: string) => {
      skipped = { ...skipped, [id]: message };
      persistSkipped();
      patch({ skipped });
    };
    try {
      // A stopped paid request can still finish. Do not overlap it with a new run.
      if (tail.current) await tail.current.catch(() => undefined);
      if (!live()) return;
      // Discover all cached successes before any network work, including after a prior failure.
      for (const sentence of supported) {
        if (staged[sentence.id]) continue;
        const hit = await session.getCached(sentence.text);
        if (!live()) return;
        if (hit) stage(sentence.id, hit);
      }
      for (const sentence of supported) {
        if (!live()) return;
        if (staged[sentence.id]) continue;
        const hit = await session.getCached(sentence.text);
        if (!live()) return;
        if (hit) {
          stage(sentence.id, hit);
          continue;
        }
        // An answer that fails validation gets one fresh request; a second
        // failure skips the sentence (it stays plain) instead of blocking the
        // article. Provider, key and network errors still stop the run.
        let result: PronunciationMarkers | null = null;
        for (let attempt = 0; attempt < 2 && !result; attempt++) {
          const request = fetchPronunciationMarkers(sentence.text, session);
          tail.current = request;
          try {
            result = await request;
          } catch (error) {
            if (!(error instanceof PronunciationValidationError) || !live()) throw error;
            if (attempt === 1) skip(sentence.id, errorMessage(error));
          } finally {
            if (tail.current === request) tail.current = null;
          }
          if (!live()) return;
        }
        if (result) stage(sentence.id, result);
      }
      if (live()) patch({ running: false });
    } catch (error) {
      if (!live()) return;
      patch({ running: false, error: errorMessage(error) });
      if (error instanceof MissingApiKeyError) onMissingKey();
    }
  };

  const display = () => {
    if (!canDisplay) return;
    savePronunciationPreferences(articleId, { enabled: true, layers: current.current.layers });
    patch({ displayed: current.current.staged, mode: true });
  };
  const setMode = (mode: boolean) => {
    if (mode) return display();
    savePronunciationPreferences(articleId, { enabled: false, layers: current.current.layers });
    patch({ mode: false });
  };
  const toggleLayer = (layer: keyof PronunciationLayers) => {
    const layers = { ...current.current.layers, [layer]: !current.current.layers[layer] };
    savePronunciationPreferences(articleId, { enabled: getPronunciationPreferences(articleId).enabled, layers });
    patch({ layers });
  };

  return {
    ...state, capable, oversized, ready, remaining, skippedCount, total: supported.length,
    coverage, usable, changed, canDisplay, run, stop, display, setMode, toggleLayer,
  };
}

export type PronunciationController = ReturnType<typeof usePronunciationMarkers>;
