/** Committed graded-reader workspace: authored lookups, device listening and reader-local checkpoints/completion. */
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useReaderWorkspace } from '../../hooks/useReaderWorkspace';
import type { OpenedReader } from '../../services/gradedReaders/session';
import { readerOccurrence } from '../../services/gradedReaders/occurrence';
import { gradedDocument } from '../../types/readerSource';
import { errorMessage } from '../../services/ai/errors';
import { navigate } from '../../hooks/useRoute';
import { ReaderView } from '../ReaderView';
import { ReaderCheckpoints } from './ReaderCheckpoints';
import { ReaderAuthoredSheets, type AuthoredSelection } from './ReaderAuthoredSheets';
import { Button } from '../ui/button';

const noAi = () => undefined;

export function GradedReaderWorkspace({
  opened,
  vocabulary,
  reload,
  focusText,
  onOpenShadowingLog,
}: {
  opened: OpenedReader;
  vocabulary: VocabularyModel;
  reload: () => void;
  focusText?: string;
  onOpenShadowingLog: (sourceId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const progress = useReaderWorkspace(opened, reload);
  const reader = opened.row.snapshot;
  const [selection, setSelection] = useState<AuthoredSelection | null>(null);
  const sentenceIds = useMemo(() => reader.body.sentences.map((sentence) => sentence.id), [reader]);
  return (
    <>
      <ReaderView
        readingDocument={{
          ...gradedDocument(reader, t),
          category: t('gradedReader.stageNumber', { number: reader.body.order }),
        }}
        source={{ kind: 'graded', readerId: reader.body.id, version: reader.version }}
        onBack={() => navigate({ name: 'gradedReaders' })}
        onMissingKey={noAi}
        onOpenShadowingLog={onOpenShadowingLog}
        focusText={focusText}
        activeWord={selection?.kind === 'word' ? selection.occurrence.lookup.word : null}
        activeSentence={selection?.kind === 'sentence' ? selection.sentence.fr : null}
        playbackEngine="device"
        authored={{
          sentenceIds,
          onWord: (spelling, sentenceId, ordinal) => {
            try {
              setSelection({
                kind: 'word',
                occurrence: readerOccurrence(reader, sentenceId, ordinal, spelling, i18n.language),
              });
            } catch (error) {
              setSelection({ kind: 'error', error: errorMessage(error) });
            }
          },
          onSentence: (id) => {
            const sentence = reader.body.sentences.find((candidate) => candidate.id === id);
            if (sentence) setSelection({ kind: 'sentence', sentence });
            else setSelection({ kind: 'error', error: `Missing reader sentence: ${id}` });
          },
        }}
        afterText={
          <div className="min-w-0 space-y-6 border-t border-ink-200 pt-6">
            <ReaderCheckpoints
              learning={reader.body.learning}
              answers={progress.answers}
              onChange={progress.change}
              onCheck={progress.check}
              onRedo={progress.redo}
              pending={progress.pending}
              error={progress.owner !== 'completion' ? progress.error : null}
              onRetry={progress.retry}
            />
            <section aria-label={t('gradedReader.completion')} className="space-y-2 border-t border-ink-200 pt-4">
              <Button
                variant="outline"
                className="min-w-40"
                disabled={progress.pending !== null}
                aria-busy={progress.pending === 'completion'}
                onClick={progress.complete}
              >
                <span className="h-4 w-4">
                  {progress.pending === 'completion' && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                </span>
                {t(progress.row.completedAt === null ? 'gradedReader.markRead' : 'gradedReader.markUnread')}
              </Button>
              <p className="h-10 overflow-auto text-xs text-ink-600" role="status">
                {progress.row.completedAt !== null
                  ? t('gradedReader.readAt', { date: new Date(progress.row.completedAt).toLocaleString(i18n.language) })
                  : t('gradedReader.status.opened')}
              </p>
              <div className="h-20 overflow-auto text-sm text-bad-700" role="status">
                {progress.owner === 'completion' && progress.error && (
                  <>
                    <span className="break-words">{t('gradedReader.saveError', { msg: progress.error })}</span>
                    <Button variant="ghost" onClick={progress.retry}>
                      {t('common.retry')}
                    </Button>
                  </>
                )}
              </div>
            </section>
          </div>
        }
      />
      {selection && (
        <ReaderAuthoredSheets
          key={JSON.stringify(selection)}
          selection={selection}
          vocabulary={vocabulary}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}
