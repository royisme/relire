/** Ordered starter and optional service reading list; independent failures never hide the local starters. */
import { useTranslation } from 'react-i18next';
import { useGradedReaders } from '../../hooks/useGradedReaders';
import { useReaderProgress } from '../../hooks/useReaderProgress';
import { useReaderCatalogue } from '../../hooks/useReaderCatalogue';
import { KeepReaderOffline } from './KeepReaderOffline';
import { readerListStatus } from '../../services/gradedReaders/status';
import { authoredText } from '../../utils/authoredText';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';

export function GradedReadersList({
  content,
  progress,
  service,
}: {
  content: ReturnType<typeof useGradedReaders>;
  progress: ReturnType<typeof useReaderProgress>;
  service?: ReturnType<typeof useReaderCatalogue>;
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
            {service && service.status !== 'disabled' && (
              <div
                role="status"
                aria-busy={service.status === 'loading'}
                className="h-28 overflow-auto text-sm text-ink-700"
              >
                {service.status === 'loading' && <p>{t('gradedReader.service.loading')}</p>}
                {service.status === 'error' && (
                  <>
                    <p className="break-words text-bad-700">{t('gradedReader.loadError', { msg: service.error })}</p>
                    <Button variant="outline" onClick={service.retry}>
                      {t('common.retry')}
                    </Button>
                  </>
                )}
                {service.status === 'ready' && (
                  <>
                    <p>
                      {t(
                        service.saved
                          ? 'gradedReader.service.savedCatalogue'
                          : service.readers?.length
                            ? 'gradedReader.service.ready'
                            : 'gradedReader.service.empty',
                      )}
                    </p>
                    {!!service.conflicts?.length && (
                      <p>
                        {t('gradedReader.service.conflict', {
                          ids: service.conflicts.map((entry) => entry.id).join(', '),
                        })}
                      </p>
                    )}
                    <Button variant="ghost" onClick={service.retry}>
                      {t('common.retry')}
                    </Button>
                  </>
                )}
              </div>
            )}
            {!content.readers?.length && !service?.readers?.length && <p>{t('gradedReader.empty')}</p>}
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
              {service?.status === 'ready' &&
                service.readers?.map((entry) => {
                  const { status, earlier } = readerListStatus(entry, progress.rows);
                  return (
                    <li key={`${entry.id}:${entry.artifactHash}`} className="min-w-0 py-4 space-y-1 break-words">
                      <Link
                        to={{ name: 'gradedReader', readerId: entry.id, version: entry.version }}
                        className="inline-flex min-h-10 items-center font-serif text-xl text-accent-900 underline underline-offset-4"
                      >
                        {entry.title.fr}
                      </Link>
                      <p className="text-sm text-ink-700">{authoredText(entry.title, i18n.language)}</p>
                      <p className="text-xs text-ink-600">
                        {t('gradedReader.stage', { number: entry.order, level: t('levels.A1') })} ·{' '}
                        {t(`gradedReader.status.${status}`)}
                      </p>
                      {earlier && <p className="text-xs text-ink-600">{t('gradedReader.earlier')}</p>}
                      <KeepReaderOffline entry={entry} />
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
  const service = useReaderCatalogue(content.readers);
  return <GradedReadersList content={content} progress={progress} service={service} />;
}
