/** Owns the area-specific add choices and article picker; each form owns its own work, not navigation. */
import { Suspense, useState } from 'react';
import { retryableLazy } from '../../utils/retryableLazy';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import type { Article } from '../../types';
import { ArticleExerciseAreaSchema, type LearningArea } from '../../types/learningArea';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { Link } from '../shell/Link';
import { Button, buttonVariants } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';
import { GenerateForm } from './GenerateForm';

// Lazy so the conjugation engine and the pack that the drill form needs stay out of the main chunk.
const ConjugationDrillForm = retryableLazy(async () => ({
  default: (await import('./ConjugationDrillForm')).ConjugationDrillForm,
}));

const GenderDrillEntry = retryableLazy(async () => ({
  default: (await import('../study/grammar/GenderDrillForm')).GenderDrillEntry,
}));
const PairsDrillForm = retryableLazy(async () => ({
  default: (await import('./PairsDrillForm')).PairsDrillForm,
}));

export function AddExercisesDialog({
  articles,
  area,
  initialChoice,
  onMissingKey,
  onClose,
}: {
  articles: Article[];
  area: LearningArea;
  initialChoice: 'article' | 'conjugation' | 'pairs' | null;
  onMissingKey: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<'article' | 'conjugation' | 'gender' | 'pairs' | null>(initialChoice);
  const generatorArea = ArticleExerciseAreaSchema.safeParse(area);
  const [pickedId, setPickedId] = useState(articles[0]?.id);
  const article = articles.find((candidate) => candidate.id === pickedId);
  return (
    <Dialog label={t('practice.add')} onClose={onClose} className="max-w-lg">
      <OverlayHeader title={t('practice.add')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="space-y-4 p-5">
        <div className="space-y-3">
          <div>
            <Button
              variant="outline"
              className="w-full justify-start"
              aria-describedby="practice-choice-import"
              onClick={() => navigate({ name: 'importExercises', area })}
            >
              {t('practice.importWorksheet')}
            </Button>
            <p id="practice-choice-import" className="mt-1 text-xs text-ink-500">
              {t('practice.importWorksheetDesc')}
            </p>
          </div>
          {generatorArea.success && (
            <div>
              <Button
                variant="outline"
                className="w-full justify-start aria-pressed:border-accent-700 aria-pressed:bg-accent-100 aria-pressed:text-accent-900"
                aria-pressed={choice === 'article'}
                aria-describedby="practice-choice-article"
                onClick={() => setChoice('article')}
              >
                {t('practice.makeFromArticle')}
              </Button>
              <p id="practice-choice-article" className="mt-1 text-xs text-ink-500">
                {t('practice.makeFromArticleDesc')}
              </p>
            </div>
          )}
          {area === 'grammar' && (
            <div>
              <Button
                variant="outline"
                className="w-full justify-start aria-pressed:border-accent-700 aria-pressed:bg-accent-100 aria-pressed:text-accent-900"
                aria-pressed={choice === 'conjugation'}
                aria-describedby="practice-choice-conjugation"
                onClick={() => setChoice('conjugation')}
              >
                {t('practice.makeConjugationDrills')}
              </Button>
              <p id="practice-choice-conjugation" className="mt-1 text-xs text-ink-500">
                {t('practice.makeConjugationDrillsDesc')}
              </p>
            </div>
          )}
          {area === 'grammar' && (
            <div>
              <Button
                variant="outline"
                className="w-full justify-start aria-pressed:border-accent-700 aria-pressed:bg-accent-100 aria-pressed:text-accent-900"
                aria-pressed={choice === 'gender'}
                aria-describedby="practice-choice-gender"
                onClick={() => setChoice('gender')}
              >
                {t('nounGender.drill.title')}
              </Button>
              <p id="practice-choice-gender" className="mt-1 text-xs text-ink-500">
                {t('nounGender.drill.description')}
              </p>
            </div>
          )}
          {(area === 'grammar' || area === 'listening') && (
            <div>
              <Button
                variant="outline"
                className="w-full justify-start aria-pressed:border-accent-700 aria-pressed:bg-accent-100 aria-pressed:text-accent-900"
                aria-pressed={choice === 'pairs'}
                aria-describedby="practice-choice-pairs"
                onClick={() => setChoice('pairs')}
              >
                {t('minimalPairs.drill.title')}
              </Button>
              <p id="practice-choice-pairs" className="mt-1 text-xs text-ink-500">
                {t('minimalPairs.drill.description')}
              </p>
            </div>
          )}
        </div>
        {choice === 'article' &&
          generatorArea.success &&
          (article ? (
            <div className="space-y-4 border-t border-ink-200 pt-4">
              <label className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-ink-800">{t('practice.article')}</span>
                <select
                  value={article.id}
                  onChange={(event) => setPickedId(event.target.value)}
                  className="h-10 w-full min-w-0 rounded-md border border-ink-300 bg-surface px-3 text-sm text-ink-900"
                >
                  {articles.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {cleanArticleTitle(candidate.title)}
                    </option>
                  ))}
                </select>
              </label>
              <GenerateForm
                key={article.id}
                area={generatorArea.data}
                article={article}
                onMissingKey={onMissingKey}
                onSaved={onClose}
              />
            </div>
          ) : (
            <div className="space-y-3 border-t border-ink-200 pt-4">
              <p className="font-serif text-lg text-ink-900">{t('practice.noArticleTitle')}</p>
              <p className="text-sm text-ink-500">{t('practice.noArticleDesc')}</p>
              <Link to={{ name: 'library' }} className={buttonVariants({ variant: 'outline' })}>
                {t('practice.openLibrary')}
              </Link>
            </div>
          ))}
        {area === 'grammar' && choice === 'conjugation' && (
          <div className="border-t border-ink-200 pt-4">
            <Suspense fallback={<div className="min-h-24" />}>
              <ConjugationDrillForm onSaved={onClose} />
            </Suspense>
          </div>
        )}
        {area === 'grammar' && choice === 'gender' && (
          <div className="border-t border-ink-200 pt-4">
            <Suspense fallback={<div className="min-h-64" />}>
              <GenderDrillEntry />
            </Suspense>
          </div>
        )}
        {(area === 'grammar' || area === 'listening') && choice === 'pairs' && (
          <div className="border-t border-ink-200 pt-4">
            <Suspense fallback={<div className="min-h-96" />}>
              <PairsDrillForm />
            </Suspense>
          </div>
        )}
      </div>
    </Dialog>
  );
}
