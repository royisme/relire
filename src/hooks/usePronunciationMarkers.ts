/** Owns bounded generation, cancellation and staged/displayed snapshots, never DOM geometry. */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createPronunciationSession, fetchPronunciationMarkers, getPronunciationIdentity,
  MissingApiKeyError, subscribePronunciationContext,
} from '../services/api';
import { errorMessage } from '../services/ai/errors';
import type { PronunciationLayers, PronunciationMarkers } from '../types/pronunciation';
import { MAX_PRONUNCIATION_SOURCE } from '../types/pronunciation';
import { hasUsablePronunciationMarkers } from '../utils/pronunciationMarkers';
import { hasGraphemeSupport, readerWords } from '../utils/readerTokens';
import type { SentencePiece } from '../utils/sentences';

export type PronunciationSnapshot = Readonly<Record<string, PronunciationMarkers>>;
const initialLayers: PronunciationLayers = { connections: true, stress: true, silent: true, syllables: true };
interface State {
  identity: string;
  staged: PronunciationSnapshot;
  displayed: PronunciationSnapshot;
  mode: boolean;
  layers: PronunciationLayers;
  running: boolean;
  stopped: boolean;
  error: string | null;
}
const empty = (identity: string): State => ({
  identity, staged: {}, displayed: {}, mode: false, layers: initialLayers,
  running: false, stopped: false, error: null,
});

export function usePronunciationMarkers(articleId: string, content: string, sentences: SentencePiece[], onMissingKey: () => void) {
  const contextIdentity = useSyncExternalStore(subscribePronunciationContext, getPronunciationIdentity);
  const identity = JSON.stringify([articleId, content, contextIdentity]);
  const [stored, setStored] = useState(() => empty(identity));
  const state = stored.identity === identity ? stored : empty(identity);
  const current = useRef(state);
  current.current = state;
  const generation = useRef(0);
  const mounted = useRef(false);
  const tail = useRef<Promise<unknown> | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    generation.current++;
    setStored(empty(identity));
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [identity]);

  const supported = useMemo(() => sentences.filter((s) => s.text.length <= MAX_PRONUNCIATION_SOURCE), [sentences]);
  const oversized = sentences.length - supported.length;
  const capable = hasGraphemeSupport();
  const ready = Object.keys(state.staged).length;
  const remaining = supported.length - ready;
  const usable = Object.values(state.staged).some(hasUsablePronunciationMarkers);
  const changed = Object.keys(state.staged).some((id) => state.staged[id] !== state.displayed[id]);
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
    if (current.current.running || !capable) return;
    const token = ++generation.current;
    const session = createPronunciationSession();
    const live = () => mounted.current && generation.current === token &&
      current.current.identity === identity && getPronunciationIdentity() === session.identity;
    patch({ running: true, stopped: false, error: null });
    let staged = { ...current.current.staged };
    const stage = (id: string, value: PronunciationMarkers) => {
      staged = { ...staged, [id]: value };
      patch({ staged });
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
        const request = fetchPronunciationMarkers(sentence.text, session);
        tail.current = request;
        let result: PronunciationMarkers;
        try {
          result = await request;
        } finally {
          if (tail.current === request) tail.current = null;
        }
        if (!live()) return;
        stage(sentence.id, result);
      }
      if (live()) patch({ running: false });
    } catch (error) {
      if (!live()) return;
      patch({ running: false, error: errorMessage(error) });
      if (error instanceof MissingApiKeyError) onMissingKey();
    }
  };

  const display = () => {
    if (usable) patch({ displayed: state.staged, mode: true });
  };
  const setMode = (mode: boolean) => patch({ mode });
  const toggleLayer = (layer: keyof PronunciationLayers) => patch({ layers: { ...state.layers, [layer]: !state.layers[layer] } });

  return {
    ...state, capable, oversized, ready, remaining, total: supported.length,
    coverage, usable, changed, run, stop, display, setMode, toggleLayer,
  };
}

export type PronunciationController = ReturnType<typeof usePronunciationMarkers>;
