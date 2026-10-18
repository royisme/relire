/** Owns the three add choices and the article picker; each form owns its own work, not navigation. */
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import type { Article } from '../../types';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { Link } from '../shell/Link';
import { Button, buttonVariants } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';
import { GenerateForm } from './GenerateForm';

// Lazy so the conjugation engine and the pack that the drill form needs stay out of the main chunk.
const ConjugationDrillForm = lazy(() =>
  import('./ConjugationDrillForm').then((module) => ({ default: module.ConjugationDrillForm })),
);

export function AddExercisesDialog({
  articles,
  fromArticle,
  onMissingKey,
  onClose,
}: {
  articles: Article[];
  fromArticle: boolean;
  onMissingKey: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<'article' | 'conjugation' | null>(fromArticle ? 'article' : null);
  const [pickedId, setPickedId] = useState(articles[0]?.id);
  const article = articles.find((candidate) => candidate.id === pickedId);
  return (
    <Dialog label={t('practice.add')} onClose={onClose} className="max-w-lg">
      <OverlayHeader title={t('practice.add')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => navigate({ name: 'importExercises' })}>
            {t('practice.importWorksheet')}
          </Button>
          <Button variant="outline" onClick={() => setChoice('article')}>
            {t('practice.makeFromArticle')}
          </Button>
          <Button variant="outline" onClick={() => setChoice('conjugation')}>
            {t('practice.makeConjugationDrills')}
          </Button>
        </div>
        {choice === 'article' &&
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
              <GenerateForm key={article.id} article={article} onMissingKey={onMissingKey} onSaved={onClose} />
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
        {choice === 'conjugation' && (
          <div className="border-t border-ink-200 pt-4">
            <Suspense fallback={<div className="min-h-24" />}>
              <ConjugationDrillForm onSaved={onClose} />
            </Suspense>
          </div>
        )}
      </div>
    </Dialog>
  );
}
