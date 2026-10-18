/**
 * `#/practice`: making a new batch from an article, the exercise batches (each
 * opening its units, with the learner's real progress), and reading an
 * article's sentences aloud for a score (the open oral assessment). The article
 * is picked here only for the generator and the oral practice; batches never
 * point at it. The form sits above the list, so new batches grow the list
 * downwards and never move the button that made them. The data comes from
 * `useUnitRows` and the generating from `GenerateForm`.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnitRows } from '../../hooks/useUnitRows';
import { setLabel } from '../../services/exercises/setLabel';
import type { Article, PronunciationAssessment } from '../../types';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { Link } from '../shell/Link';
import { Button, buttonVariants } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { DeleteSetDialog } from './DeleteSetDialog';
import { GenerateForm } from './GenerateForm';
import { OralPractice } from './OralPractice';
import { UnitList } from './UnitList';

interface PracticePageProps {
  articles: Article[];
  onMissingKey: () => void;
  onAssessed: (assessment: PronunciationAssessment, sentence: string) => void;
}

const selectClass =
  'h-10 w-full max-w-sm cursor-pointer rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900 focus:border-accent-600 focus:outline-none';

export function PracticePage({ articles, onMissingKey, onAssessed }: PracticePageProps) {
  const { t } = useTranslation();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const article = articles.find((candidate) => candidate.id === pickedId) ?? articles[0] ?? null;
  const { rows, loading, error } = useUnitRows();
  const [deleting, setDeleting] = useState<{ setId: string; label: string } | null>(null);
  // Newest batch first (every unit of a batch carries its creation time); units inside a batch by their number.
  const sets = useMemo(() => {
    const bySet = new Map<string, typeof rows>();
    for (const row of rows) bySet.set(row.unit.setId, [...(bySet.get(row.unit.setId) ?? []), row]);
    return [...bySet.entries()]
      .map(([setId, group]) => ({
        setId,
        label: setLabel(t, group[0].unit),
        level: group[0].unit.level,
        createdAt: group[0].unit.createdAt,
        rows: group,
      }))
      .sort((a, b) => b.createdAt - a.createdAt || a.setId.localeCompare(b.setId));
  }, [rows, t]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <PageHeader title={t('practice.title')} subtitle={t('practice.subtitle')} />

      {article ? (
        <section aria-labelledby="practice-from-article" className="space-y-4">
          <div>
            <h3 id="practice-from-article" className="font-serif text-lg font-semibold text-ink-900">
              {t('practice.fromArticleTitle')}
            </h3>
            <p className="text-sm text-ink-500">{t('practice.fromArticleDesc')}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.article')}</span>
            <select value={article.id} onChange={(event) => setPickedId(event.target.value)} className={selectClass}>
              {articles.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {cleanArticleTitle(candidate.title)}
                </option>
              ))}
            </select>
          </label>
          <GenerateForm key={article.id} article={article} onMissingKey={onMissingKey} />
        </section>
      ) : (
        <section className="space-y-4 text-center">
          <p className="font-serif text-lg text-ink-900">{t('practice.noArticleTitle')}</p>
          <p className="text-sm text-ink-500">{t('practice.noArticleDesc')}</p>
          <Link to={{ name: 'library' }} className={buttonVariants()}>
            {t('practice.openLibrary')}
          </Link>
        </section>
      )}

      <section aria-labelledby="practice-units" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 id="practice-units" className="font-serif text-lg font-semibold text-ink-900">
              {t('practice.unitsTitle')}
            </h3>
            <p className="text-sm text-ink-500">{t('practice.unitsDesc')}</p>
          </div>
          <Link to={{ name: 'importExercises' }} className={buttonVariants({ variant: 'outline' })}>
            {t('practice.importExercises')}
          </Link>
        </div>
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        {loading ? (
          <div aria-busy="true" className="min-h-12" />
        ) : sets.length > 0 ? (
          sets.map((set) => (
            <section key={set.setId} aria-labelledby={`practice-set-${set.setId}`} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h4
                  id={`practice-set-${set.setId}`}
                  className="min-w-0 break-words font-serif text-base font-semibold text-ink-900"
                >
                  {set.label}
                  <span className="ml-2 text-xs font-normal text-ink-500">{t(`levels.${set.level}`)}</span>
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('practice.deleteSetNamed', { title: set.label })}
                  onClick={() => setDeleting({ setId: set.setId, label: set.label })}
                >
                  {t('practice.deleteSet')}
                </Button>
              </div>
              <UnitList rows={set.rows} />
            </section>
          ))
        ) : (
          !error && <p className="text-sm text-ink-600">{t('practice.noUnits')}</p>
        )}
      </section>

      {article && (
        <section aria-labelledby="practice-oral" className="space-y-4">
          <div>
            <h3 id="practice-oral" className="font-serif text-lg font-semibold text-ink-900">
              {t('practice.oralTitle')}
            </h3>
            <p className="text-sm text-ink-500">{t('practice.oralDesc')}</p>
          </div>
          <OralPractice key={article.id} article={article} onAssessed={onAssessed} />
        </section>
      )}
      {deleting && <DeleteSetDialog setId={deleting.setId} title={deleting.label} onClose={() => setDeleting(null)} />}
    </div>
  );
}
