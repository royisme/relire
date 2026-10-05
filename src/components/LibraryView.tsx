import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, FilePlus2, Pencil, Search, Trash2 } from 'lucide-react';
import { Article } from '../types';
import { Button } from './ui/button';
import { Dialog, OverlayHeader } from './ui/overlay';
import { cleanArticleTitle, formatLevel } from '../utils/i18nHelpers';

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

type SortKey = 'title' | 'level' | 'words' | 'createdAt';

const wordCount = (a: Article) => a.content.split(/\s+/).filter(Boolean).length;

export const LibraryView: React.FC<LibraryViewProps> = ({
  articles,
  missingSamples,
  onOpen,
  onAdd,
  onEdit,
  onDelete,
  onRestoreSamples,
}) => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);

  const levels = useMemo(
    () => [...new Set(articles.map((a) => (a.level.match(/(A1|A2|B1|B2|C1|C2)/i)?.[1] || a.level).toUpperCase()))].sort(),
    [articles]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = articles.filter((a) => {
      if (level !== 'all' && !a.level.toUpperCase().includes(level)) return false;
      if (!q) return true;
      return [a.title, a.source, a.category, a.content].some((v) => v?.toLowerCase().includes(q));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = (a: Article) =>
      sort.key === 'words' ? wordCount(a) : sort.key === 'title' ? cleanArticleTitle(a.title).toLowerCase() : (a[sort.key] || '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [articles, query, level, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'createdAt' || key === 'words' ? 'desc' : 'asc' }));

  const th = (key: SortKey, label: string, className = '') => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`font-medium ${className}`}>
      <button
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 h-10 text-left text-ink-600 hover:text-ink-900 cursor-pointer"
      >
        {label}
        {sort.key === key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const date = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('library.title')}</h2>
          <p className="text-sm text-ink-500 mt-0.5 tnum">{t('library.count', { count: articles.length })}</p>
        </div>
        <Button onClick={onAdd}>
          <FilePlus2 className="w-4 h-4" />
          <span>{t('library.add')}</span>
        </Button>
      </div>

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
              className="w-full h-10 pl-9 pr-3 text-sm bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
            />
          </label>
          <div role="group" aria-label={t('importer.cefrLevel')} className="flex items-center rounded-md border border-ink-200 bg-white p-0.5">
            {['all', ...levels].map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                aria-pressed={level === l}
                className={`h-9 px-3 rounded-md text-sm cursor-pointer ${level === l ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'}`}
              >
                {l === 'all' ? t('library.allLevels') : l}
              </button>
            ))}
          </div>
        </div>
      )}

      {articles.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white px-6 py-14 text-center space-y-4">
          <p className="font-serif text-lg text-ink-900">{t('library.emptyTitle')}</p>
          <p className="text-sm text-ink-500 max-w-md mx-auto">{t('library.emptyDesc')}</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button onClick={onAdd}>{t('library.add')}</Button>
            {missingSamples > 0 && (
              <Button variant="outline" onClick={onRestoreSamples}>
                {t('library.restoreSamples')}
              </Button>
            )}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white px-6 py-12 text-center space-y-3">
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
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs">
              <tr className="text-left">
                {th('title', t('library.colTitle'), 'pl-4 pr-2')}
                {th('level', t('library.colLevel'), 'hidden sm:table-cell px-2 w-56 whitespace-nowrap')}
                {th('words', t('library.colWords'), 'hidden md:table-cell px-2 w-24')}
                {th('createdAt', t('library.colAdded'), 'hidden md:table-cell px-2 w-32')}
                <th scope="col" className="w-24 pr-3">
                  <span className="sr-only">{t('library.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-ink-50">
                  <td className="pl-4 pr-2 py-3 align-top">
                    <button onClick={() => onOpen(a)} className="block text-left cursor-pointer max-w-full">
                      <span className="block font-serif text-base font-semibold text-ink-900 hover:text-accent-800">
                        {cleanArticleTitle(a.title)}
                      </span>
                      <span className="block text-xs text-ink-500 mt-0.5">
                        <span className="sm:hidden">{formatLevel(a.level, i18n.language)} · </span>
                        {[a.category, a.source].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </td>
                  <td className="hidden sm:table-cell px-2 py-3 align-top text-ink-700 whitespace-nowrap">{formatLevel(a.level, i18n.language)}</td>
                  <td className="hidden md:table-cell px-2 py-3 align-top text-ink-700 tnum">{wordCount(a)}</td>
                  <td className="hidden md:table-cell px-2 py-3 align-top text-ink-600">{date(a.createdAt)}</td>
                  <td className="pr-2 py-1.5 align-top">
                    <div className="flex items-center justify-end">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(a)} aria-label={t('library.edit')} title={t('library.edit')}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(a)}
                        aria-label={t('library.delete')}
                        title={t('library.delete')}
                        className="hover:text-bad-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {articles.length > 0 && missingSamples > 0 && (
        <p className="text-sm text-ink-500">
          <button onClick={onRestoreSamples} className="underline underline-offset-2 hover:text-ink-900 cursor-pointer">
            {t('library.restoreSamples')}
          </button>
        </p>
      )}

      {pendingDelete && (
        <Dialog onClose={() => setPendingDelete(null)} label={t('library.deleteTitle')} className="max-w-sm">
          <OverlayHeader title={t('library.deleteTitle')} onClose={() => setPendingDelete(null)} closeLabel={t('common.close')} />
          <div className="p-5 space-y-4">
            <p className="text-sm text-ink-700">
              {t('library.deleteDesc', { title: cleanArticleTitle(pendingDelete.title) })}
            </p>
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
