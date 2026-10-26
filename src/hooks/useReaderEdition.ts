/** Owns route-edition loading and drops replies from overtaken routes, retries and unmounted sessions. */
import { useCallback, useEffect, useState } from 'react';
import { resolveReaderEdition } from '../services/gradedReaders/edition';
import { errorMessage } from '../services/ai/errors';
import type { PublishedReader } from '../types/gradedReader';

export function useReaderEdition(readerId: string, version?: string) {
  const identity = `${readerId}:${version ?? ''}`;
  const [state, setState] = useState<{
    identity?: string;
    reader?: PublishedReader;
    missing?: boolean;
    error?: string;
  }>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void resolveReaderEdition(readerId, version).then(
      (reader) => {
        if (live) setState({ identity, reader, missing: !reader });
      },
      (error: unknown) => {
        if (live) setState({ identity, error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [readerId, version, identity, attempt]);
  const retry = useCallback(() => {
    setState({});
    setAttempt((value) => value + 1);
  }, []);
  return { ...(state.identity === identity ? state : {}), retry };
}
