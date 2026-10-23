/** Starter-only ordered reading list; content and committed progress load independently, without a service catalogue. */
import { useTranslation } from 'react-i18next';
import { useGradedReaders } from '../../hooks/useGradedReaders';
import { useReaderProgress } from '../../hooks/useReaderProgress';
import type { PublishedReader } from '../../types/gradedReader';
import type { ReaderProgress } from '../../types/readerProgress';
import { authoredText } from '../../utils/authoredText';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';

export function readerListStatus(reader: PublishedReader, rows?: ReaderProgress[]) {
  const current = rows?.find((row) => row.readerId === reader.body.id && row.version === reader.version);
  return {
    status:
      rows === undefined ? 'unavailable' : current?.completedAt != null ? 'read' : current ? 'opened' : 'notOpened',
    earlier: rows?.find(
      (row) => row.readerId === reader.body.id && row.version !== reader.version && row.completedAt !== null,
    ),
  };
}

export function GradedReadersList({
  content,
  progress,
}: {
  content: ReturnType<typeof useGradedReaders>;
  progress: ReturnType<typeof useReaderProgress>;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="mx-auto max-w-3xl min-w-0 px-4 py-6 sm:px-6 space-y-4">
      <h1 className="font-serif text-2xl font-semibold break-words">{t('gradedReader.listTitle')}</h1>
      <p className="text-sm text-ink-600">{t('gradedReader.reviewNotice')}</p>
      <div aria-busy={content.status === 'loading'} className="min-h-40 min-w-0">
        {content.status === 'loading' && <p role="status">{t('gradedReader.loading')}</p>}
        {content.status === 'error' && (
          <div role="alert" className="h-40 overflow-auto space-y-2 text-sm text-bad-700">
            <p className="break-words">{t('gradedReader.loadError', { msg: content.error })}</p>
            <Button variant="outline" onClick={content.retry}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {content.status === 'ready' && (
          <>
            <div role="status" className="h-20 overflow-auto text-sm text-bad-700">
              {progress.error && (
                <>
                  <span className="break-words">{t('gradedReader.progressError', { msg: progress.error })}</span>
                  <Button variant="ghost" onClick={progress.retry}>
                    {t('common.retry')}
                  </Button>
                </>
              )}
            </div>
            {!content.readers?.length && <p>{t('gradedReader.empty')}</p>}
            <ol className="divide-y divide-ink-200">
              {content.readers?.map((reader) => {
                const { status, earlier } = readerListStatus(reader, progress.rows);
                return (
                  <li key={reader.body.id} className="min-w-0 py-4 space-y-1 break-words">
                    <Link
                      to={{ name: 'gradedReader', readerId: reader.body.id }}
                      className="inline-flex min-h-10 items-center font-serif text-xl text-accent-900 underline underline-offset-4"
                    >
                      {reader.body.title.fr}
                    </Link>
                    <p className="text-sm text-ink-700">{authoredText(reader.body.title, i18n.language)}</p>
                    <p className="text-xs text-ink-600">
                      {t('gradedReader.stage', { number: reader.body.order, level: t('levels.A1') })} ·{' '}
                      {t(`gradedReader.status.${status}`)}
                    </p>
                    {earlier && <p className="text-xs text-ink-600">{t('gradedReader.earlier')}</p>}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

export function GradedReadersPage() {
  const content = useGradedReaders();
  const progress = useReaderProgress();
  return <GradedReadersList content={content} progress={progress} />;
}
