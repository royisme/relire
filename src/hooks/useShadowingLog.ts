/**
 * The shadowing log's data: every recorded sentence, ordered by its
 * current source text. Records whose sentence no longer appears are "changed"; records
 * whose source is gone are "removed" (graded editions keep their own unavailable group,
 * because the edition is pinned by version and never becomes another source). Order is
 * never stored, always derived.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Article } from '../types';
import type { ExerciseUnit } from '../types/exercises';
import type { ReaderProgress } from '../types/readerProgress';
import { gradedDocument, passageDocument, readerIdentity, type ReaderDocument } from '../types/readerSource';
import type { ShadowingSentence } from '../types/shadowing';
import { listShadowing, subscribeShadowing, sourceOfRecording } from '../storage/shadowing';
import { listReaderProgress, subscribeReaders } from '../storage/gradedReaders';
import { normalizeText } from '../storage/audio';
import { errorMessage } from '../services/ai/errors';
import { setLabel, unitTitle } from '../services/exercises/setLabel';
import { splitArticle } from '../utils/sentences';

export interface LogRow {
  record: ShadowingSentence;
  /** Reader sentence id of the first occurrence; null when the text changed. */
  sentenceId: string | null;
}

export interface LogGroup {
  id: string;
  document: ReaderDocument;
  rows: LogRow[];
  changed: LogRow[];
  /** The graded edition's local snapshot is gone: rows stay listed and playable, without a reader link. */
  unavailable?: boolean;
}

export function useShadowingLog(articles: Article[], units: ExerciseUnit[] | null, unitsError: string | null) {
  const { t, i18n } = useTranslation();
  const [records, setRecords] = useState<ShadowingSentence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReaderProgress[] | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      listShadowing().then(
        (all) => {
          if (!live) return;
          setRecords(all);
          setError(null);
        },
        (err) => live && setError(errorMessage(err)),
      );
    void load();
    const unsubscribe = subscribeShadowing(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let live = true;
    const load = () =>
      listReaderProgress().then(
        (rows) => {
          if (!live) return;
          setProgress(rows);
          setProgressError(null);
        },
        (err) => live && setProgressError(errorMessage(err)),
      );
    void load();
    const unsubscribe = subscribeReaders(() => void load());
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  const { groups, removed } = useMemo(() => {
    const bySource = new Map<string, ShadowingSentence[]>();
    for (const record of records ?? []) {
      const id = readerIdentity(sourceOfRecording(record));
      bySource.set(id, [...(bySource.get(id) ?? []), record]);
    }
    const groups: LogGroup[] = [];
    const sources: { id: string; document: ReaderDocument }[] = articles.map((article) => ({
      id: readerIdentity({ kind: 'article', articleId: article.id }),
      document: article,
    }));
    for (const unit of units ?? []) {
      const title = unitTitle(unit, i18n.resolvedLanguage);
      const document = passageDocument(unit, setLabel(t, unit, i18n.resolvedLanguage), i18n.resolvedLanguage);
      if (document)
        sources.push({
          id: readerIdentity({ kind: 'passage', unitId: unit.id }),
          document: {
            ...document,
            title: title === document.title ? title : `${title} — ${document.title}`,
          },
        });
    }
    for (const row of progress ?? [])
      sources.push({
        id: readerIdentity({ kind: 'graded', readerId: row.readerId, version: row.version }),
        document: gradedDocument(row.snapshot),
      });
    for (const source of sources) {
      const list = bySource.get(source.id);
      if (!list) continue;
      bySource.delete(source.id);
      const first = new Map<string, { id: string; index: number }>();
      splitArticle(source.document.content)
        .flat()
        .forEach((sentence, index) => {
          const key = normalizeText(sentence.text);
          if (!first.has(key)) first.set(key, { id: sentence.id, index });
        });
      const rows: (LogRow & { index: number })[] = [];
      const changed: LogRow[] = [];
      for (const record of list) {
        const hit = first.get(normalizeText(record.text));
        if (hit) rows.push({ record, sentenceId: hit.id, index: hit.index });
        else changed.push({ record, sentenceId: null });
      }
      rows.sort((a, b) => a.index - b.index);
      groups.push({ ...source, rows, changed });
    }
    // A graded record whose snapshot is gone keeps its own honest group: still listed,
    // still playable, never re-attributed to an article or another edition.
    const unavailableGraded = new Map<string, ShadowingSentence[]>();
    const removed: LogRow[] = [];
    for (const list of bySource.values()) {
      for (const record of list) {
        if (record.graded) {
          const id = readerIdentity(sourceOfRecording(record));
          unavailableGraded.set(id, [...(unavailableGraded.get(id) ?? []), record]);
        } else removed.push({ record, sentenceId: null });
      }
    }
    for (const [id, list] of unavailableGraded)
      groups.push({
        id,
        document: {
          title: t('shadowingLog.unavailableEdition', { id: list[0].graded!.readerId }),
          content: '',
          level: '',
          category: '',
          source: '',
        },
        rows: list.map((record) => ({ record, sentenceId: null })),
        changed: [],
        unavailable: true,
      });
    return { groups, removed };
  }, [records, progress, articles, units, t, i18n.resolvedLanguage]);

  return {
    loading: (records === null && !error) || (units === null && !unitsError) || (progress === null && !progressError),
    error: error ?? unitsError ?? progressError,
    groups,
    removed,
  };
}
