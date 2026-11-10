/** Reads committed reader history for the starter list; an unavailable read never becomes empty progress. */
import { useEffect, useState } from 'react';
import { listReaderProgress, subscribeReaders } from '../storage/gradedReaders';
import type { ReaderProgress } from '../types/readerProgress';
import { errorMessage } from '../services/ai/errors';

export function useReaderProgress() {
  const [state, setState] = useState<{ rows?: ReaderProgress[]; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let token = 0;
    const read = async () => {
      const request = ++token;
      try {
        const rows = await listReaderProgress();
        if (live && request === token) setState({ rows });
      } catch (error) {
        if (live && request === token) setState({ error: errorMessage(error) });
      }
    };
    void read();
    const unsubscribe = subscribeReaders(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
