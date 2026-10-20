/** Lookup-scoped explicit bookmark/context actions; membership is personal, never mere book existence. */
import { useEffect, useRef, useState } from 'react';
import type { WordAnalysis } from '../types';
import type { VocabularyLookup } from '../services/vocabulary/identity';
import { vocabularyContextKey, vocabularyKey } from '../services/vocabulary/identity';
import { saveVocabularyBookmark, removeVocabularyBookmark } from '../storage/vocabulary';
import type { VocabularyModel } from './useVocabulary';
import { getVocabularyBook } from '../storage/vocabularyBook';
export function useVocabularyBookmark(
  model: VocabularyModel,
  lookup: VocabularyLookup | null,
  analysis: WordAnalysis | null,
) {
  const [status, setStatus] = useState<{ owner: VocabularyLookup | null; busy: boolean; error: string | null }>({
    owner: null,
    busy: false,
    error: null,
  });
  const current = useRef(lookup);
  useEffect(() => {
    current.current = lookup;
    return () => {
      current.current = null;
    };
  }, [lookup]);
  const row = lookup ? model.rows.find((row) => row.key === vocabularyKey(lookup.word)) : undefined;
  const saved = !!row?.bookmarked;
  const contextSaved =
    saved && !!lookup && !!row?.contexts.some((context) => context.id === vocabularyContextKey(lookup));
  const act = async (remove: boolean) => {
    if (!lookup || !analysis || (status.owner === lookup && status.busy)) return;
    const owner = lookup;
    setStatus({ owner, busy: true, error: null });
    try {
      if (remove) await removeVocabularyBookmark(vocabularyKey(owner.word));
      else {
        const book = await getVocabularyBook();
        const entry = book?.entries.find((entry) => entry.key === vocabularyKey(owner.word));
        const source =
          entry && book
            ? {
                bookId: book.manifest.bookId,
                version: book.manifest.version,
                sourceIds: entry.sourceIds,
                senses: entry.senses,
              }
            : undefined;
        await saveVocabularyBookmark(owner, analysis, source);
      }
      if (current.current === owner) setStatus({ owner, busy: false, error: null });
    } catch (error) {
      if (current.current === owner)
        setStatus({ owner, busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return {
    saved,
    contextSaved,
    busy: status.owner === lookup && status.busy,
    error: status.owner === lookup ? status.error : null,
    save: () => act(false),
    remove: () => act(true),
  };
}
export type VocabularyBookmarkActions = ReturnType<typeof useVocabularyBookmark>;
