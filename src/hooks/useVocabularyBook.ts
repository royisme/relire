/** Words-entry complete-book loading and explicit revalidation; errors never install a partial candidate. */
import { useEffect, useRef, useState } from 'react';
import type { VocabularyBook } from '../types/vocabulary';
import { contentServiceUrl, ContentServiceHttpError } from '../services/grammarTopics/service';
import { getVocabularyBook } from '../storage/vocabularyBook';
import { downloadVocabularyBook } from '../services/vocabulary/load';
export function useVocabularyBook() {
  const [book, setBook] = useState<VocabularyBook>();
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const alive = useRef(false);
  const locked = useRef(false);
  const configured = !!contentServiceUrl();
  const download = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setRestart(false);
    try {
      const candidate = await downloadVocabularyBook((page, total) => {
        if (alive.current) setProgress({ page, total });
      });
      if (alive.current) setBook(candidate);
    } catch (error) {
      if (alive.current) {
        setError(error instanceof Error ? error.message : String(error));
        setRestart(error instanceof ContentServiceHttpError && error.status === 410);
      }
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    void getVocabularyBook()
      .then((cached) => {
        if (!alive.current) return;
        if (cached) {
          setBook(cached);
          setBusy(false);
        } else if (configured) void download();
        else setBusy(false);
      })
      .catch((error: unknown) => {
        if (alive.current) {
          setError(error instanceof Error ? error.message : String(error));
          setBusy(false);
        }
      });
    return () => {
      alive.current = false;
    };
  }, [configured]);
  return { book, busy, progress, error, restart, configured, download };
}
export type VocabularyBookModel = ReturnType<typeof useVocabularyBook>;
