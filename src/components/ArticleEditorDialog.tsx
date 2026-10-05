import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import { Button } from './ui/button';
import { Article } from '../types';
import { formatLevel } from '../utils/i18nHelpers';

interface ArticleEditorDialogProps {
  /** Present when editing; absent when adding. */
  article?: Article | null;
  onClose: () => void;
  onSave: (article: Article) => void;
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CATEGORIES = ['Littérature', 'Actualités', 'Culture', 'Science', 'Société'];

const field =
  'w-full h-10 px-3 text-sm bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600';

export const ArticleEditorDialog: React.FC<ArticleEditorDialogProps> = ({ article, onClose, onSave }) => {
  const { t, i18n } = useTranslation();
  const editing = !!article;
  const [title, setTitle] = useState(article?.title ?? '');
  const [level, setLevel] = useState(article?.level ?? 'B1');
  const [category, setCategory] = useState(article?.category ?? '');
  const [source, setSource] = useState(article?.source ?? '');
  const [content, setContent] = useState(article?.content ?? '');

  useEffect(() => {
    setTitle(article?.title ?? '');
    setLevel(article?.level ?? 'B1');
    setCategory(article?.category ?? '');
    setSource(article?.source ?? '');
    setContent(article?.content ?? '');
  }, [article]);

  const words = content.split(/\s+/).filter(Boolean).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave({
      id: article?.id ?? 'custom-' + Date.now(),
      createdAt: article?.createdAt ?? new Date().toISOString().split('T')[0],
      title: title.trim() || content.trim().split(/\s+/).slice(0, 6).join(' ') + '…',
      level,
      category: category.trim(),
      source: source.trim() || undefined,
      content: content.trim(),
    });
    onClose();
  };

  const heading = editing ? t('library.editTitle') : t('library.addTitle');

  return (
    <Dialog onClose={onClose} label={heading}>
      <OverlayHeader
        title={heading}
        subtitle={editing ? undefined : t('library.addSubtitle')}
        onClose={onClose}
        closeLabel={t('common.close')}
      />
      <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="sm:col-span-2 block">
            <span className="block text-xs font-medium text-ink-700 mb-1">{t('importer.articleTitle')}</span>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('importer.articleTitlePlaceholder')}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1">{t('importer.cefrLevel')}</span>
            <select className={field + ' cursor-pointer'} value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {formatLevel(l, i18n.language)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-1">
            <span className="block text-xs font-medium text-ink-700 mb-1">{t('importer.category')}</span>
            <input
              className={field}
              list="relire-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="relire-categories">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-xs font-medium text-ink-700 mb-1">{t('library.source')}</span>
            <input
              className={field}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t('library.sourcePlaceholder')}
            />
          </label>
        </div>

        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-ink-700 mb-1">
            <span>{t('importer.content')}</span>
            <span className="text-ink-500 tnum">{t('reader.wordCount', { count: words })}</span>
          </span>
          <textarea
            required
            rows={editing ? 12 : 9}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('importer.contentPlaceholder')}
            className="w-full px-3 py-2.5 text-sm font-serif leading-relaxed bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!content.trim()}>
            {editing ? t('library.saveChanges') : t('library.addSubmit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
