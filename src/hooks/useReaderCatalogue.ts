/** Owns the optional service catalogue's mount-scoped state independently of starter readiness. */
import { useCallback, useEffect, useState } from 'react';
import { contentServiceUrl } from '../services/grammarTopics/service';
import { loadReaderCatalogue } from '../services/gradedReaders/service';
import { mergeReaderCatalogue, readerSummary, type ReaderSummary } from '../services/gradedReaders/catalogue';
import { errorMessage } from '../services/ai/errors';
import type { PublishedReader } from '../types/gradedReader';

export interface ReaderCatalogueState {
  status: 'disabled' | 'loading' | 'ready' | 'error';
  readers?: ReaderSummary[];
  conflicts?: ReaderSummary[];
  saved?: boolean;
  error?: string;
}
export function useReaderCatalogue(bundled?: PublishedReader[]) {
  const configured = Boolean(contentServiceUrl());
  const [state, setState] = useState<ReaderCatalogueState>({ status: configured ? 'loading' : 'disabled' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!configured || !bundled) return;
    let live = true;
    void (async () => {
      const [{ catalogue, saved }, starters] = await Promise.all([
        loadReaderCatalogue(),
        Promise.all(bundled.map(readerSummary)),
      ]);
      const { readers, conflicts } = mergeReaderCatalogue(starters, catalogue.readers);
      return {
        status: 'ready' as const,
        readers: readers.slice(starters.length),
        conflicts,
        saved,
      };
    })().then(
      (next) => {
        if (live) setState(next);
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [configured, bundled, attempt]);
  const retry = useCallback(() => {
    setState({ status: configured ? 'loading' : 'disabled' });
    setAttempt((value) => value + 1);
  }, [configured]);
  return { ...state, retry };
}
