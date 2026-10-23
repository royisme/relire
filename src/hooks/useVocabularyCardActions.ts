/** Confirmed single-card destructive actions capture original tokens, never retry stale work with new tokens. */
import { useEffect, useRef, useState } from 'react';
import type { VocabularyTokens } from '../types/vocabulary';
import {
  deleteVocabularyCard,
  getVocabularySnapshot,
  resetVocabularySchedule,
  StaleVocabularyError,
  vocabularyChanged,
} from '../storage/vocabulary';
export function useVocabularyCardActions(key: string, onDone: () => void) {
  const [confirmation, setConfirmation] = useState<{ kind: 'reset' | 'delete'; tokens: VocabularyTokens } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const prepare = async (kind: 'reset' | 'delete') => {
    setError(null);
    try {
      const snapshot = await getVocabularySnapshot(key);
      if (alive.current) setConfirmation({ kind, tokens: snapshot.tokens });
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
    }
  };
  const commit = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmation.kind === 'reset') await resetVocabularySchedule(key, confirmation.tokens, Date.now());
      else await deleteVocabularyCard(key, confirmation.tokens);
      if (alive.current) {
        setConfirmation(null);
        onDone();
      }
    } catch (error) {
      if (error instanceof StaleVocabularyError) {
        await vocabularyChanged();
        if (alive.current) {
          setConfirmation(null);
          onDone();
        }
      } else if (alive.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return {
    confirmation,
    busy,
    error,
    prepare,
    commit,
    cancel: () => {
      if (!busy) setConfirmation(null);
    },
  };
}
