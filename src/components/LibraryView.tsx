import React, { useEffect, useMemo, useState } from 'react';
import type { SortingState } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { FilePlus2, Search } from 'lucide-react';
import { LibraryArticlesTable } from './LibraryArticlesTable';
import { Article } from '../types';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { Segmented } from './ui/segmented';
import { Dialog, OverlayHeader } from './ui/overlay';
import { cleanArticleTitle } from '../utils/i18nHelpers';
import { navigate } from '../hooks/useRoute';
import { listShadowing } from '../storage/shadowing';

interface LibraryViewProps {
  articles: Article[];
  /** Sample articles that are no longer in the library. */
  missingSamples: number;
  onOpen: (article: Article) => void;
  onAdd: () => void;
  onEdit: (article: Article) => void;
  onDelete: (article: Article) => void;
  onRestoreSamples: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  articles,
  missingSamples,
  onOpen,
  onAdd,
  onEdit,
  onDelete,
  onRestoreSamples,
}) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);
  // Recorded sentences that deleting the pending article would also remove.
  const [recordings, setRecordings] = useState<{ articleId: string; count: number } | null>(null);
  const pendingRecordings = pendingDelete && recordings?.articleId === pendingDelete.id ? recordings.count : 0;
  useEffect(() => {
    if (!pendingDelete) return;
    let live = true;
    const articleId = pendingDelete.id;
    listShadowing(articleId).then(
      (list) => live && setRecordings({ articleId, count: list.length }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pendingDelete]);

  const levels = useMemo(
    () =>
      [...new Set(articles.map((a) => (a.level.match(/(A1|A2|B1|B2|C1|C2)/i)?.[1] || a.level).toUpperCase()))].sort(),
    [articles],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (level !== 'all' && !a.level.toUpperCase().includes(level)) return false;
      if (!q) return true;
      return [a.title, a.source, a.category, a.content].some((v) => v?.toLowerCase().includes(q));
    });
  }, [articles, query, level]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <PageHeader
        title={t('library.title')}
        subtitle={<span className="tnum">{t('library.count', { count: articles.length })}</span>}
        actions={
          <Button onClick={() => setAdding(true)}>
            <FilePlus2 className="w-4 h-4" />
            <span>{t('library.add')}</span>
          </Button>
        }
      />

      {articles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 basis-56 min-w-0">
            <span className="sr-only">{t('library.search')}</span>
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.search')}
              className="w-full h-10 pl-9 pr-3 text-sm bg-surface rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
            />
          </label>
          <Segmented
            label={t('importer.cefrLevel')}
            value={level}
            onChange={setLevel}
            options={['all', ...levels].map((l) => ({ value: l, label: l === 'all' ? t('library.allLevels') : l }))}
          />
        </div>
      )}

      {articles.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-surface px-6 py-14 text-center space-y-4">
          <p className="font-serif text-lg text-ink-900">{t('library.emptyTitle')}</p>
          <p className="text-sm text-ink-500 max-w-md mx-auto">{t('library.emptyDesc')}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button onClick={() => setAdding(true)}>{t('library.add')}</Button>
            {missingSamples > 0 && (
              <Button variant="outline" onClick={onRestoreSamples}>
                {t('library.restoreSamples')}
              </Button>
            )}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-surface px-6 py-12 text-center space-y-3">
          <p className="text-sm text-ink-600">{t('library.noMatch')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery('');
              setLevel('all');
            }}
          >
            {t('library.clearFilters')}
          </Button>
        </div>
      ) : (
        <LibraryArticlesTable
          articles={rows}
          sorting={sorting}
          onSortingChange={setSorting}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={setPendingDelete}
        />
      )}

      {articles.length > 0 && missingSamples > 0 && (
        <p className="text-sm text-ink-500">
          <button onClick={onRestoreSamples} className="underline underline-offset-2 hover:text-ink-900 cursor-pointer">
            {t('library.restoreSamples')}
          </button>
        </p>
      )}

      {adding && (
        <Dialog label={t('library.addTitle')} onClose={() => setAdding(false)} className="max-w-sm">
          <OverlayHeader
            title={t('library.addTitle')}
            closeLabel={t('common.close')}
            onClose={() => setAdding(false)}
          />
          <div className="p-5 flex flex-col gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAdding(false);
                onAdd();
              }}
            >
              {t('library.addManual')}
            </Button>
            <Button
              onClick={() => {
                setAdding(false);
                navigate({ name: 'importArticle' });
              }}
            >
              {t('library.addImport')}
            </Button>
          </div>
        </Dialog>
      )}

      {pendingDelete && (
        <Dialog onClose={() => setPendingDelete(null)} label={t('library.deleteTitle')} className="max-w-sm">
          <OverlayHeader
            title={t('library.deleteTitle')}
            onClose={() => setPendingDelete(null)}
            closeLabel={t('common.close')}
          />
          <div className="p-5 space-y-4">
            <p className="text-sm text-ink-700">
              {t('library.deleteDesc', { title: cleanArticleTitle(pendingDelete.title) })}
            </p>
            {pendingRecordings > 0 && (
              <p className="text-sm text-ink-700">{t('library.deleteRecordings', { count: pendingRecordings })}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(pendingDelete);
                  setPendingDelete(null);
                }}
              >
                {t('library.delete')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
