/**
 * The shadowing log's data: every recorded sentence, ordered by the article's
 * current text. Records whose sentence no longer appears are "changed"; records
 * whose article is gone are "removed". Order is never stored, always derived.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Article } from '../types';
import type { ShadowingSentence } from '../types/shadowing';
import { listShadowing, subscribeShadowing } from '../storage/shadowing';
import { normalizeText } from '../storage/audio';
import { errorMessage } from '../services/ai/errors';
import { splitArticle } from '../utils/sentences';

export interface LogRow {
  record: ShadowingSentence;
  /** Reader sentence id of the first occurrence; null when the text changed. */
  sentenceId: string | null;
}

export interface LogGroup {
  article: Article;
  rows: LogRow[];
  changed: LogRow[];
}

export function useShadowingLog(articles: Article[]) {
  const [records, setRecords] = useState<ShadowingSentence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => listShadowing().then(
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

  const { groups, removed } = useMemo(() => {
    const byArticle = new Map<string, ShadowingSentence[]>();
    for (const record of records ?? []) byArticle.set(record.articleId, [...(byArticle.get(record.articleId) ?? []), record]);
    const groups: LogGroup[] = [];
    for (const article of articles) {
      const list = byArticle.get(article.id);
      if (!list) continue;
      byArticle.delete(article.id);
      const first = new Map<string, { id: string; index: number }>();
      splitArticle(article.content).flat().forEach((sentence, index) => {
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
      groups.push({ article, rows, changed });
    }
    const removed = [...byArticle.values()].flat().map((record): LogRow => ({ record, sentenceId: null }));
    return { groups, removed };
  }, [records, articles]);

  return { loading: records === null && !error, error, groups, removed };
}
