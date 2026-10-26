/** Owns mount-scoped list or reader readiness; request validation and offline storage stay in loaders. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadGrammarTopic, loadGrammarTopics } from '../services/grammarTopics/load';
import { ContentServiceHttpError } from '../services/grammarTopics/service';
import type { GrammarTopic, GrammarTopicListEntry } from '../types/grammarTopic';

interface GrammarTopicsState {
  status: 'loading' | 'ready' | 'error' | 'notFound';
  topics?: GrammarTopicListEntry[];
  topic?: GrammarTopic;
  error?: string;
  listError?: string;
}

export function useGrammarTopics(topicId?: string): GrammarTopicsState {
  const [state, setState] = useState<GrammarTopicsState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    // A slow or unavailable list must not block reading or marking the topic itself.
    void loadGrammarTopics().then(
      (topics) => {
        if (live) setState((previous) => ({ ...previous, topics, ...(!topicId && { status: 'ready' }) }));
      },
      (error: unknown) => {
        if (live)
          setState((previous) =>
            topicId ? { ...previous, listError: errorMessage(error) } : { status: 'error', error: errorMessage(error) },
          );
      },
    );
    if (topicId)
      void loadGrammarTopic(topicId).then(
        (topic) => {
          if (live) setState((previous) => ({ ...previous, status: 'ready', topic }));
        },
        (error: unknown) => {
          if (live)
            setState((previous) => ({
              ...previous,
              status: error instanceof ContentServiceHttpError && error.status === 404 ? 'notFound' : 'error',
              error: errorMessage(error),
            }));
        },
      );
    return () => {
      live = false;
    };
  }, [topicId]);
  return state;
}
