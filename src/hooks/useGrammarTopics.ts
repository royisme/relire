/** Owns mount-scoped topic readiness; not the shared loader cache or rendering. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadedGrammarTopics, loadGrammarTopics } from '../services/grammarTopics/load';
import type { GrammarTopicsPack } from '../types/grammarTopic';

interface GrammarTopicsState {
  status: 'loading' | 'ready' | 'error';
  pack?: GrammarTopicsPack;
  error?: string;
}

export function useGrammarTopics(): GrammarTopicsState {
  const [state, setState] = useState<GrammarTopicsState>(() => {
    const pack = loadedGrammarTopics();
    return pack ? { status: 'ready', pack } : { status: 'loading' };
  });
  useEffect(() => {
    let live = true;
    void loadGrammarTopics().then(
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
