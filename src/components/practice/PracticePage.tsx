/** Area-scoped exercise list. Complete batches and deletion belong to PracticeSetPage. */
import { useMemo, useState } from 'react';
import { FilePlus2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUnitRows } from '../../hooks/useUnitRows';
import { aggregateAreaSets, filterSets } from '../../services/exercises/sets';
import type { Article } from '../../types';
import type { LearningArea } from '../../types/learningArea';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { Segmented } from '../ui/segmented';
import { AddExercisesDialog } from './AddExercisesDialog';
import { SetTable } from './SetTable';

export function PracticePage({
  area,
  articles,
  onMissingKey,
}: {
  area: LearningArea;
  articles: Article[];
  onMissingKey: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { rows, loading, error } = useUnitRows();
  const sets = useMemo(
    () => aggregateAreaSets(rows, area, t, i18n.resolvedLanguage),
    [rows, area, t, i18n.resolvedLanguage],
  );
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const filtered = useMemo(() => filterSets(sets, query, level), [sets, query, level]);
  const levels = useMemo(() => [...new Set(sets.map((set) => set.level))].sort(), [sets]);
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <PageHeader
        title={t('learning.exercisesTitle', { area: t(`learning.areas.${area}`) })}
        subtitle={
          <span className="tnum inline-block min-h-5">
            {!loading && !error && t('practice.setCount', { count: sets.length })}
          </span>
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <FilePlus2 aria-hidden="true" className="h-4 w-4" />
            {t('practice.add')}
          </Button>
        }
      />
      <p className="text-sm text-ink-600">{t('learning.scopedCounts')}</p>
      {area === 'listening' && <p className="text-sm text-ink-600">{t('learning.listeningSupport')}</p>}
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
                <label className="relative min-w-0 flex-1 basis-56">
                  <span className="sr-only">{t('practice.search')}</span>
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('practice.search')}
                    className="h-10 w-full rounded-md border border-ink-300 bg-surface pl-9 pr-3 text-sm focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
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
              <div className="space-y-3 border-t border-ink-200 py-12">
                <h2 className="font-serif text-lg font-semibold">{t('learning.emptyTitle')}</h2>
                <p className="text-sm text-ink-600">
                  {t(area === 'listening' ? 'learning.listeningEmpty' : 'learning.emptyDesc')}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 border-t border-ink-200 py-12">
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
              <SetTable sets={filtered} area={area} />
            )}
          </>
        )
      )}
      {adding && (
        <AddExercisesDialog
          area={area}
          articles={articles}
          initialChoice={null}
          onMissingKey={onMissingKey}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
