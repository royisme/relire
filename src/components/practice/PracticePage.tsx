/** Owns Practice's set list, filters and add/delete overlays; generation and oral recording have their own owners. */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnitRows } from '../../hooks/useUnitRows';
import { aggregateSets, filterSets, type SetRow } from '../../services/exercises/sets';
import type { Article, PronunciationAssessment } from '../../types';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { Link } from '../shell/Link';
import { Button, buttonVariants } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { Segmented } from '../ui/segmented';
import { AddExercisesDialog } from './AddExercisesDialog';
import { DeleteSetDialog } from './DeleteSetDialog';
import { OralPractice } from './OralPractice';
import { SetTable } from './SetTable';

interface PracticePageProps {
  articles: Article[];
  onMissingKey: () => void;
  onAssessed: (assessment: PronunciationAssessment, sentence: string) => void;
}

export function PracticePage({ articles, onMissingKey, onAssessed }: PracticePageProps) {
  const { t } = useTranslation();
  const { rows, loading, error } = useUnitRows();
  const sets = useMemo(() => aggregateSets(rows, t), [rows, t]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const filtered = useMemo(() => filterSets(sets, query, level), [sets, query, level]);
  const levels = useMemo(() => [...new Set(sets.map((set) => set.level))].sort(), [sets]);
  const [adding, setAdding] = useState<'choices' | 'article' | null>(null);
  const [deleting, setDeleting] = useState<SetRow | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const article = articles.find((candidate) => candidate.id === pickedId) ?? articles[0];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <PageHeader
        title={t('practice.title')}
        subtitle={
          <span className="tnum inline-block min-h-5">
            {!loading && !error && t('practice.setCount', { count: sets.length })}
          </span>
        }
        actions={<Button onClick={() => setAdding('choices')}>{t('practice.add')}</Button>}
      />
      {error && (
        <p role="alert" className="break-words text-sm text-bad-700">
          {error}
        </p>
      )}
      {loading ? (
        <div aria-busy="true" className="h-56" />
      ) : (
        !error && (
          <>
            {sets.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="min-w-0 flex-1 basis-56">
                  <span className="sr-only">{t('practice.search')}</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('practice.search')}
                    className="h-10 w-full rounded-md border border-ink-300 bg-surface px-3 text-sm focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
                  />
                </label>
                <Segmented
                  label={t('practice.level')}
                  value={level}
                  onChange={setLevel}
                  options={['all', ...levels].map((value) => ({
                    value,
                    label: value === 'all' ? t('library.allLevels') : value,
                  }))}
                />
              </div>
            )}
            {sets.length === 0 ? (
              <div className="space-y-4 rounded-lg border border-ink-200 bg-surface px-6 py-14 text-center">
                <p className="font-serif text-lg text-ink-900">{t('practice.emptyTitle')}</p>
                <p className="mx-auto max-w-md text-sm text-ink-500">{t('practice.emptyDesc')}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Link to={{ name: 'importExercises' }} className={buttonVariants({ variant: 'outline' })}>
                    {t('practice.importWorksheet')}
                  </Link>
                  <Button variant="outline" onClick={() => setAdding('article')}>
                    {t('practice.makeFromArticle')}
                  </Button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 rounded-lg border border-ink-200 bg-surface px-6 py-12 text-center">
                <p className="text-sm text-ink-600">{t('practice.noMatch')}</p>
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
              <SetTable sets={filtered} onDelete={setDeleting} />
            )}
          </>
        )
      )}
      {article && (
        <section aria-labelledby="practice-oral" className="space-y-4 border-t border-ink-200 pt-6">
          <div>
            <h3 id="practice-oral" className="font-serif text-lg font-semibold text-ink-900">
              {t('practice.oralTitle')}
            </h3>
            <p className="text-sm text-ink-500">{t('practice.oralDesc')}</p>
          </div>
          <label className="block min-w-0">
            <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.article')}</span>
            <select
              value={article.id}
              onChange={(event) => setPickedId(event.target.value)}
              className="h-10 w-full min-w-0 max-w-sm rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900"
            >
              {articles.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {cleanArticleTitle(candidate.title)}
                </option>
              ))}
            </select>
          </label>
          <OralPractice key={article.id} article={article} onAssessed={onAssessed} />
        </section>
      )}
      {adding && (
        <AddExercisesDialog
          articles={articles}
          fromArticle={adding === 'article'}
          onMissingKey={onMissingKey}
          onClose={() => setAdding(null)}
        />
      )}
      {deleting && (
        <DeleteSetDialog
          setId={deleting.setId}
          title={deleting.title}
          count={deleting.rows.length}
          onClose={() => setDeleting(null)}
          onDeleted={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
