/** Owns mount-scoped spelling-pack readiness and retry; validation and shared loads stay in the loader. */
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadSpellingSoundsPack } from '../services/spellingSounds/load';
import type { SpellingSoundsPack } from '../types/spellingSounds';

interface SpellingSoundsState {
  status: 'loading' | 'ready' | 'error';
  pack?: SpellingSoundsPack;
  error?: string;
}

export function useSpellingSounds(): SpellingSoundsState & { retry: () => void } {
  const [state, setState] = useState<SpellingSoundsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void loadSpellingSoundsPack().then(
      (pack) => {
        if (live) setState({ status: 'ready', pack });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);
  return { ...state, retry };
}
