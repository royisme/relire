/** One Words area: real Today/Browse/Review routes share the same learner model and complete-book cache. */
import { Suspense } from 'react';
import { retryableLazy } from '../utils/retryableLazy';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../hooks/useVocabulary';
import { useVocabularyBook } from '../hooks/useVocabularyBook';
import { PageHeader } from './ui/page-header';
import { Link } from './shell/Link';
import { VocabularyHome } from './vocabulary/VocabularyHome';
import { VocabularyReview } from './vocabulary/VocabularyReview';
// Lazy so TanStack Table loads with Browse instead of the startup chunks.
const VocabularyBrowser = retryableLazy(async () => ({
  default: (await import('./vocabulary/VocabularyBrowser')).VocabularyBrowser,
}));
export function VocabularyView({
  place = 'today',
  model,
}: {
  place?: 'today' | 'all' | 'review';
  model: VocabularyModel;
}) {
  const { t } = useTranslation();
  const content = useVocabularyBook();
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      {place !== 'review' && (
        <>
          <PageHeader title={t('vocab.title')} subtitle={t('vocab.subtitle')} />
          <nav aria-label={t('vocab.pages')} className="flex gap-4 border-b border-ink-200 text-sm">
            <Link
              to={{ name: 'study', tab: 'words' }}
              aria-current={place === 'today' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${place === 'today' ? 'border-accent-700 font-medium text-ink-950' : 'border-transparent text-ink-600'}`}
            >
              {t('vocab.today')}
            </Link>
            <Link
              to={{ name: 'wordsAll' }}
              aria-current={place === 'all' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${place === 'all' ? 'border-accent-700 font-medium text-ink-950' : 'border-transparent text-ink-600'}`}
            >
              {t('vocab.allWords')}
            </Link>
          </nav>
        </>
      )}
      <p role={model.error ? 'alert' : 'status'} className="h-12 overflow-auto break-words text-sm text-bad-700">
        {model.error}
      </p>
      {place === 'review' ? (
        <VocabularyReview model={model} book={content.book} />
      ) : place === 'all' ? (
        <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
          <VocabularyBrowser rows={model.rows} book={content.book} />
        </Suspense>
      ) : (
        <VocabularyHome model={model} />
      )}
    </div>
  );
}
