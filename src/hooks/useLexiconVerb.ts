/** Owns mount-scoped readiness of one lemma's lexicon verb data (ready with none when no service is configured); not loading policy or drawing. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { contentServiceUrl } from '../services/grammarTopics/service';
import { lexiconVerb } from '../services/lexicon/verbs';
import type { VerbData } from '../types/lexicon';

interface LexiconVerbState {
  status: 'loading' | 'ready' | 'error';
  data?: VerbData;
  error?: string;
}

export function useLexiconVerb(lemma: string): LexiconVerbState {
  const [state, setState] = useState<LexiconVerbState>(
    contentServiceUrl() ? { status: 'loading' } : { status: 'ready' },
  );
  useEffect(() => {
    if (!contentServiceUrl()) return;
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
