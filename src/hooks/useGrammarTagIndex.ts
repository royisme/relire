/** Owns mount-scoped tag-index readiness without loading topic content; not link rendering. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadedGrammarTagIndex, loadGrammarTagIndex } from '../services/grammarTopics/tagIndex';
import type { GrammarTagIndex } from '../types/grammarTagIndex';

interface GrammarTagIndexState {
  status: 'loading' | 'ready' | 'error';
  index?: GrammarTagIndex;
  error?: string;
}

export function useGrammarTagIndex(): GrammarTagIndexState {
  const [state, setState] = useState<GrammarTagIndexState>(() => {
    const index = loadedGrammarTagIndex();
    return index ? { status: 'ready', index } : { status: 'loading' };
  });
  useEffect(() => {
    let live = true;
    void loadGrammarTagIndex().then(
      (index) => {
        if (live) setState({ status: 'ready', index });
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
