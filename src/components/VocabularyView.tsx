/** One Words area: real Overview/Browse/Review routes share the same learner model and complete-book cache. */
import { Suspense } from 'react';
import { retryableLazy } from '../utils/retryableLazy';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../hooks/useVocabulary';
import { useVocabularyBook } from '../hooks/useVocabularyBook';
import { PageHeader } from './ui/page-header';
import { Link } from './shell/Link';
import { VocabularyHome } from './vocabulary/VocabularyHome';
import { VocabularyReview } from './vocabulary/VocabularyReview';
import { VocabularyRun } from './vocabulary/game/VocabularyRun';
import { VocabularyMap } from './vocabulary/game/VocabularyMap';
// Lazy so TanStack Table loads with Browse instead of the startup chunks.
const VocabularyBrowser = retryableLazy(async () => ({
  default: (await import('./vocabulary/VocabularyBrowser')).VocabularyBrowser,
}));
export function VocabularyView({
  place = 'home',
  model,
}: {
  place?: 'home' | 'all' | 'review' | 'play' | 'map';
  model: VocabularyModel;
}) {
  const { t } = useTranslation();
  const content = useVocabularyBook();
  // The Overview also reports a wordbook failure, so it never reads as an empty queue.
  const shown = place === 'home' ? (model.error ?? content.error) : model.error;
  const focused = place === 'review' || place === 'play';
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      {!focused && (
        <>
          <PageHeader title={t('vocab.title')} subtitle={t('vocab.subtitle')} />
          <nav aria-label={t('vocab.pages')} className="flex gap-4 border-b border-ink-200 text-sm">
            <Link
              to={{ name: 'words' }}
              aria-current={place === 'home' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${place === 'home' ? 'border-accent-700 font-medium text-ink-950' : 'border-transparent text-ink-600'}`}
            >
              {t('vocab.overview')}
            </Link>
            <Link
              to={{ name: 'wordsAll' }}
              aria-current={place === 'all' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${place === 'all' ? 'border-accent-700 font-medium text-ink-950' : 'border-transparent text-ink-600'}`}
            >
              {t('vocab.allWords')}
            </Link>
            <Link
              to={{ name: 'wordsMap' }}
              aria-current={place === 'map' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 ${place === 'map' ? 'border-accent-700 font-medium text-ink-950' : 'border-transparent text-ink-600'}`}
            >
              {t('vocab.map.title')}
            </Link>
          </nav>
        </>
      )}
      <p role={shown ? 'alert' : 'status'} className="h-12 overflow-auto break-words text-sm text-bad-700">
        {shown}
      </p>
      {place === 'review' ? (
        <VocabularyReview model={model} book={content.book} />
      ) : place === 'play' ? (
        <VocabularyRun model={model} book={content.book} />
      ) : place === 'map' ? (
        <VocabularyMap model={model} content={content} />
      ) : place === 'all' ? (
        <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
          <VocabularyBrowser rows={model.rows} book={content.book} />
        </Suspense>
      ) : (
        <VocabularyHome
          model={model}
          book={content.book}
          pending={(content.busy && !content.book) || !!content.error}
          failed={!!content.error}
        />
      )}
    </div>
  );
}
