/** Owns mount-scoped starter-pack readiness with a stale-load guard; validation and memoisation stay in the loader. */
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadStarterReaders } from '../services/gradedReaders/load';
import type { PublishedReader } from '../types/gradedReader';

interface GradedReadersState {
  status: 'loading' | 'ready' | 'error';
  readers?: PublishedReader[];
  error?: string;
}

export function useGradedReaders(): GradedReadersState & { retry: () => void } {
  const [state, setState] = useState<GradedReadersState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Session token: a newer retry or unmount must own the next state, never an overtaken load.
    let live = true;
    void loadStarterReaders().then(
      (readers) => {
        if (live) setState({ status: 'ready', readers });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
