/** Owns mount-scoped readiness of one lemma's lexicon verb data; the lexicon is part of the app, so it is always asked. Not loading policy or drawing. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { lexiconVerb } from '../services/lexicon/verbs';
import type { VerbData } from '../types/lexicon';

interface LexiconVerbState {
  status: 'loading' | 'ready' | 'error';
  data?: VerbData;
  error?: string;
}

export function useLexiconVerb(lemma: string): LexiconVerbState {
  const [state, setState] = useState<LexiconVerbState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    void lexiconVerb(lemma).then(
      (data) => {
        if (live) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [lemma]);
  return state;
}
