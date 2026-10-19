/** Owns mount-scoped pack readiness (ready on the first render when the pack is already loaded); not loading/cache policy, lookup or rendering. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadedGrammarPack, loadGrammarPack } from '../services/grammarPack/load';
import type { GrammarPack } from '../types/grammarPack';

interface GrammarPackState {
  status: 'loading' | 'ready' | 'error';
  pack?: GrammarPack;
  error?: string;
}

export function useGrammarPack(): GrammarPackState {
  const [state, setState] = useState<GrammarPackState>(() => {
    const pack = loadedGrammarPack();
    return pack ? { status: 'ready', pack } : { status: 'loading' };
  });
  useEffect(() => {
    let live = true;
    void loadGrammarPack().then(
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
  }, []);
  return state;
}
