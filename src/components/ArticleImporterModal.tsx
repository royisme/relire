import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import { X, Sparkles, BookOpen, FileText, CheckCircle2 } from 'lucide-react';
import { Article } from '../types';
import { SAMPLE_ARTICLES } from '../data/sampleArticles';
import { formatLevel, formatArticleSource, cleanArticleTitle } from '../utils/i18nHelpers';

interface ArticleImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (article: Article) => void;
  articles: Article[];
}

export const ArticleImporterModal: React.FC<ArticleImporterModalProps> = ({
  isOpen,
  onClose,
  onImport,
  articles,
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'paste' | 'presets'>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [level, setLevel] = useState('B1');
  const [category, setCategory] = useState('Littérature');
  const [source, setSource] = useState('');

  if (!isOpen) return null;

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const newArticle: Article = {
      id: 'custom-' + Date.now(),
      title: title.trim() || 'Texte de lecture ' + new Date().toLocaleDateString(),
      level,
      category,
      source: source.trim() || 'Presse-papier',
      content: content.trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };

    onImport(newArticle);
    setContent('');
    setTitle('');
    onClose();
  };

  const handleSelectPreset = (preset: Article) => {
    onImport(preset);
    onClose();
  };

  return (
    <Dialog onClose={onClose} label={t('importer.title')}>
        <OverlayHeader title={t('importer.title')} subtitle={t('importer.subtitle')} onClose={onClose} closeLabel={t('common.close')} />

        {/* Tab Selection */}
        <div className="flex border-b border-ink-200 px-6 pt-2 gap-4 bg-white/50">
          <button
            onClick={() => setActiveTab('paste')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'paste'
                ? 'border-accent-700 text-accent-950 font-semibold'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t('importer.content')}
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'border-accent-700 text-accent-950 font-semibold'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t('importer.sampleBtn')}
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'paste' ? (
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">
                    {t('importer.articleTitle')}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('importer.articleTitlePlaceholder')}
                    className="w-full px-3 py-2 text-sm bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      {t('importer.cefrLevel')}
                    </label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 cursor-pointer"
                    >
                      <option value="A1">A1 ({formatLevel('A1', i18n.language)})</option>
                      <option value="A2">A2 ({formatLevel('A2', i18n.language)})</option>
                      <option value="B1">B1 ({formatLevel('B1', i18n.language)})</option>
                      <option value="B2">B2 ({formatLevel('B2', i18n.language)})</option>
                      <option value="C1">C1 ({formatLevel('C1', i18n.language)})</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      {t('importer.category')}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white rounded-md border border-ink-300 focus:outline-none focus:border-accent-600"
                    >
                      <option value="Littérature">{t('importer.categoryLiterature')}</option>
                      <option value="Actualités">{t('importer.categoryNews')}</option>
                      <option value="Culture">{t('importer.categoryCulture')}</option>
                      <option value="Tech">{t('importer.categoryTech')}</option>
                      <option value="Custom">{t('importer.categoryCustom')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-ink-700">
                    {t('importer.content')} <span className="text-red-500">*</span>
                  </label>
                  <span className="text-xs text-ink-400">
                    {content.length} {t('reader.wordCount', { count: content.split(/\s+/).filter(Boolean).length })}
                  </span>
                </div>
                <textarea
                  required
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('importer.contentPlaceholder')}
                  className="w-full px-3.5 py-3 text-sm font-sans leading-relaxed bg-white rounded-lg border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-ink-600 hover:text-ink-900 rounded-md hover:bg-ink-200/50 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!content.trim()}
                  className="h-10 px-4 text-sm font-semibold rounded-md bg-accent-700 hover:bg-accent-800 disabled:opacity-50 text-white transition-all cursor-pointer"
                >
                  {t('importer.importSubmit')}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {SAMPLE_ARTICLES.map((article) => (
                <div
                  key={article.id}
                  onClick={() => handleSelectPreset(article)}
                  className="p-4 rounded-lg border border-ink-200 bg-white hover:border-accent-500 hover:cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="font-serif font-semibold text-base text-ink-900 group-hover:text-accent-800">
                      {cleanArticleTitle(article.title)}
                    </h4>
                    <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-accent-100/80 text-accent-900">
                      {formatLevel(article.level, i18n.language)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 line-clamp-2 leading-relaxed">
                    {article.content.slice(0, 140)}...
                  </p>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-ink-400">
                    <span>{formatArticleSource(article.source, i18n.language)}</span>
                    <span className="text-accent-700 font-medium group-hover:underline">
                      {t('importer.importSubmit')} →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </Dialog>
  );
};
