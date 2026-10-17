/** Live all-history accuracy, including retained attempts whose source was deleted. Fail closed on read errors. */
import { useEffect, useState } from 'react';
import { accuracyByGrammarTag, subscribeExercises } from '../storage/exercises';
import type { TagAccuracy } from '../storage/exerciseAttempts';
import { aiErrorText } from '../utils/aiErrorText';

export function useExerciseAccuracy() {
  const [state, setState] = useState<{ tags: TagAccuracy[]; loading: boolean; error: string }>({
    tags: [],
    loading: true,
    error: '',
  });
  useEffect(() => {
    let revision = 0;
    let live = true;
    async function read() {
      const mine = ++revision;
      setState({ tags: [], loading: true, error: '' });
      try {
        const tags = await accuracyByGrammarTag();
        if (live && mine === revision) setState({ tags, loading: false, error: '' });
      } catch (error) {
        if (live && mine === revision) setState({ tags: [], loading: false, error: aiErrorText(error) });
      }
    }
    void read();
    const unsubscribe = subscribeExercises(() => void read());
    return () => {
      live = false;
      revision++;
      unsubscribe();
    };
  }, []);
  return state;
}
