/** Reads committed studied marks with stale-load protection; write failures belong to the pressed control. */
import { useEffect, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { listTopicStudied, markTopicStudied, subscribeTopicStudied, unmarkTopicStudied } from '../storage/topicStudied';

export function useTopicStudied() {
  const [state, setState] = useState<{ studied: ReadonlySet<string>; error?: string }>({ studied: new Set() });
  useEffect(() => {
    let live = true;
    let token = 0;
    const read = async () => {
      const request = ++token;
      try {
        const rows = await listTopicStudied();
        if (live && request === token) setState({ studied: new Set(rows.map((row) => row.topicId)) });
      } catch (error) {
        if (live && request === token) setState((previous) => ({ ...previous, error: errorMessage(error) }));
      }
    };
    void read();
    const unsubscribe = subscribeTopicStudied(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  return {
    ...state,
    mark: (id: string) => markTopicStudied(id, Date.now()),
    unmark: unmarkTopicStudied,
  };
}
