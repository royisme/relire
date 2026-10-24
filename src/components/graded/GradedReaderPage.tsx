/** Resolves the exact bundled route edition, then gates the writable workspace on its durable snapshot commit. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGradedReaders } from '../../hooks/useGradedReaders';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import type { PublishedReader } from '../../types/gradedReader';
import type { OpenedReader } from '../../services/gradedReaders/session';
import { findStarterReader } from '../../services/gradedReaders/load';
import { openReaderEdition } from '../../storage/gradedReaders';
import { errorMessage } from '../../services/ai/errors';
import { GradedReaderWorkspace } from './GradedReaderWorkspace';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';

export function ReaderEditionGate({
  reader,
  vocabulary,
  focusText,
  onOpenShadowingLog,
}: {
  reader: PublishedReader;
  vocabulary: VocabularyModel;
  focusText?: string;
  onOpenShadowingLog: (sourceId: string) => void;
}) {
  const [state, setState] = useState<{ opened?: OpenedReader; error?: string }>({});
  const [attempt, setAttempt] = useState(0);
  const reload = () => {
    setState({});
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    let live = true;
    void openReaderEdition(reader).then(
      (opened) => {
        if (live) setState({ opened });
      },
      (error: unknown) => {
        if (live) setState({ error: errorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [reader, attempt]);
  if (state.opened)
    return (
      <GradedReaderWorkspace
        key={attempt}
        opened={state.opened}
        vocabulary={vocabulary}
        reload={reload}
        focusText={focusText}
        onOpenShadowingLog={onOpenShadowingLog}
      />
    );
  return <ReaderRouteStatus error={state.error} retry={reload} />;
}

function ReaderRouteStatus({
  error,
  retry,
  missing = false,
}: {
  error?: string;
  retry: () => void;
  missing?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-3xl min-w-0 px-4 py-6 sm:px-6 space-y-4">
      <Link to={{ name: 'gradedReaders' }} className="inline-flex min-h-10 items-center text-accent-900 underline">
        {t('gradedReader.back')}
      </Link>
      <div className="h-40 overflow-auto break-words text-sm" role="status" aria-busy={!error && !missing}>
        <p className={error ? 'text-bad-700' : 'text-ink-700'}>
          {missing
            ? t('notFound.gradedReader')
            : error
              ? t('gradedReader.openError', { msg: error })
              : t('gradedReader.loading')}
        </p>
        {(error || missing) && (
          <Button variant="outline" onClick={retry}>
            {t('common.retry')}
          </Button>
        )}
      </div>
    </section>
  );
}

export function GradedReaderPage({
  readerId,
  version,
  sentence,
  vocabulary,
  onOpenShadowingLog,
}: {
  readerId: string;
  version?: string;
  sentence?: string;
  vocabulary: VocabularyModel;
  onOpenShadowingLog: (sourceId: string) => void;
}) {
  const content = useGradedReaders();
  const reader = content.status === 'ready' ? findStarterReader(readerId, version) : undefined;
  if (!reader)
    return <ReaderRouteStatus error={content.error} missing={content.status === 'ready'} retry={content.retry} />;
  return (
    <ReaderEditionGate
      key={`${readerId}:${reader.version}`}
      reader={reader}
      vocabulary={vocabulary}
      focusText={sentence}
      onOpenShadowingLog={onOpenShadowingLog}
    />
  );
}
