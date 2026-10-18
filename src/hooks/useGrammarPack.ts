/** Owns mount-scoped pack readiness; not loading/cache policy, lookup or rendering. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadGrammarPack } from '../services/grammarPack/load';
import type { GrammarPack } from '../types/grammarPack';

interface GrammarPackState {
  status: 'loading' | 'ready' | 'error';
  pack?: GrammarPack;
  error?: string;
}

export function useGrammarPack(): GrammarPackState {
  const [state, setState] = useState<GrammarPackState>({ status: 'loading' });
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
