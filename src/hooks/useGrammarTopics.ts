/** Owns mount-scoped list or reader readiness; request validation and offline storage stay in loaders. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadGrammarTopic, loadGrammarTopics } from '../services/grammarTopics/load';
import { ContentServiceHttpError } from '../services/grammarTopics/service';
import type { GrammarTopic, GrammarTopicSummary } from '../types/grammarTopic';

interface GrammarTopicsState {
  status: 'loading' | 'ready' | 'error' | 'notFound';
  topics?: GrammarTopicSummary[];
  topic?: GrammarTopic;
  error?: string;
}

export function useGrammarTopics(topicId?: string): GrammarTopicsState {
  const [state, setState] = useState<GrammarTopicsState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    const request = topicId
      ? loadGrammarTopic(topicId).then((topic) => ({ topic }))
      : loadGrammarTopics().then((topics) => ({ topics }));
    void request.then(
      (data) => {
        if (live) setState({ status: 'ready', ...data });
      },
      (error: unknown) => {
        if (live)
          setState({
            status: topicId && error instanceof ContentServiceHttpError && error.status === 404 ? 'notFound' : 'error',
            error: errorMessage(error),
          });
      },
    );
    return () => {
      live = false;
    };
  }, [topicId]);
  return state;
}
