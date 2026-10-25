/** Speaking entry and durable Read aloud workspace; OralPractice owns presentation, existing recorder owns capture/assessment. */
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { retryableLazy } from '../../utils/retryableLazy';
import type { Article, PronunciationAssessment } from '../../types';
import { resolveReadAloud } from '../../services/readAloud';
import { cleanArticleTitle } from '../../utils/i18nHelpers';
import { Link } from '../shell/Link';
import { Button, buttonVariants } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { OralPractice } from './OralPractice';
import { FrenchSounds } from '../speaking/FrenchSounds';
import { LetterSounds } from '../speaking/LetterSounds';
import { SoundContrastCounts } from '../speaking/SoundContrastCounts';

const AddExercisesDialog = retryableLazy(async () => ({
  default: (await import('./AddExercisesDialog')).AddExercisesDialog,
}));

interface Props {
  articles: Article[];
  workspace: boolean;
  articleId?: string;
  sentence?: string;
  onAssessed: (assessment: PronunciationAssessment, sentence: string) => void;
  onMissingKey: () => void;
}
export function SpeakingPage({ articles, workspace, articleId, sentence, onAssessed, onMissingKey }: Props) {
  const { t } = useTranslation();
  const [addingPairs, setAddingPairs] = useState(false);
  const selection = articleId ? resolveReadAloud(articles, articleId, sentence) : undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      {workspace && (
        <Link to={{ name: 'speaking' }} className="inline-flex min-h-10 items-center text-sm text-accent-900 underline">
          {t('learning.speaking')}
        </Link>
      )}
      <PageHeader
        title={t(workspace ? 'learning.readAloud' : 'learning.speaking')}
        subtitle={t('learning.speakingDesc')}
      />
      {!workspace ? (
        <>
          <Link to={{ name: 'readAloud' }} className={buttonVariants()}>
            {t('learning.readAloud')}
          </Link>
          <p className="text-sm text-ink-600">{t('learning.shadowingContext')}</p>
          <Link
            to={{ name: 'recordings' }}
            className="inline-flex min-h-10 items-center text-sm text-accent-900 underline"
          >
            {t('nav.recordings')}
          </Link>
          <section className="min-w-0 space-y-4 border-t border-ink-200 pt-6" aria-labelledby="sound-pairs-title">
            <div>
              <h2 id="sound-pairs-title" className="font-serif text-lg font-semibold text-ink-900">
                {t('minimalPairs.drill.title')}
              </h2>
              <p className="mt-1 text-sm text-ink-600">{t('minimalPairs.drill.description')}</p>
            </div>
            <Button variant="outline" onClick={() => setAddingPairs(true)}>
              {t('minimalPairs.drill.make')}
            </Button>
            <SoundContrastCounts />
          </section>
          <LetterSounds />
          <FrenchSounds />
          {addingPairs && (
            <Suspense fallback={null}>
              <AddExercisesDialog
                area="listening"
                articles={articles}
                initialChoice="pairs"
                onMissingKey={onMissingKey}
                onClose={() => setAddingPairs(false)}
              />
            </Suspense>
          )}
        </>
      ) : articleId ? (
        selection ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink-200 pb-4">
              <h2 className="break-words font-serif text-lg font-semibold">
                {cleanArticleTitle(selection.article.title)}
              </h2>
              <Link
                to={{ name: 'readAloud' }}
                className="inline-flex min-h-10 items-center text-sm text-accent-900 underline"
              >
                {t('learning.chooseArticle')}
              </Link>
            </div>
            <OralPractice article={selection.article} index={selection.index} onAssessed={onAssessed} />
          </>
        ) : (
          <div className="space-y-3">
            <p role="status" className="text-sm text-ink-600">
              {t('learning.sourceUnavailable')}
            </p>
            <Link
              to={{ name: 'readAloud' }}
              className="inline-flex min-h-10 items-center text-sm text-accent-900 underline"
            >
              {t('learning.chooseArticle')}
            </Link>
          </div>
        )
      ) : articles.length ? (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold">{t('learning.chooseArticle')}</h2>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  to={{ name: 'readAloud', articleId: article.id }}
                  className="inline-flex min-h-10 items-center break-words py-3 text-accent-900 underline"
                >
                  {cleanArticleTitle(article.title)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{t('learning.speakingEmpty')}</p>
          <Link to={{ name: 'library' }} className={buttonVariants({ variant: 'outline' })}>
            {t('practice.openLibrary')}
          </Link>
        </div>
      )}
    </div>
  );
}
