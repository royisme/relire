/**
 * The Conjugation page's request state: working, the latest result, or the real error. Owns request ordering
 * (a new request overtakes the old one; unmount drops a late one). Does not own what a request does
 * (services/conjugation/resolve.ts) or any drawing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/ai/errors';
import { loadGrammarPack } from '../services/grammarPack/load';
import { resolveVerb, type ConjugationResult } from '../services/conjugation/resolve';

interface ConjugationState {
  working: boolean;
  /** Kept while the next request runs, so the page does not change height; dropped when a request fails. */
  result?: ConjugationResult;
  error?: string;
}

export function useConjugation() {
  const [state, setState] = useState<ConjugationState>({ working: false });
  const token = useRef(0);

  const run = useCallback((typed: string) => {
    const mine = ++token.current;
    setState((current) => ({ working: true, result: current.result }));
    loadGrammarPack()
      .then((pack) => resolveVerb(typed, pack))
      .then(
        (result) => {
          if (token.current === mine) setState({ working: false, result });
        },
        (error: unknown) => {
          if (token.current === mine) setState({ working: false, error: errorMessage(error) });
        },
      );
  }, []);

  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );

  return { ...state, run };
}
