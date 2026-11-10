/** Prepares and saves reader-sentence dictation before opening Practice; the shared saver owns save-only retries. */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { prepareReaderDictation } from '../../services/exercises/fromReader';
import type { PublishedReader } from '../../types/gradedReader';
import { Button } from '../ui/button';

export function ReaderDictationSection({ reader }: { reader: PublishedReader }) {
  const { t, i18n } = useTranslation();
  const { status, save } = useUnitSaver();
  const working = status.kind === 'working';
  async function practise() {
    const units = await save(() => prepareReaderDictation({ reader, language: i18n.language, t }));
    if (units) navigate({ name: 'practiceSet', area: 'listening', setId: units[0].setId });
  }
  return (
    <section aria-labelledby="reader-dictation" className="min-w-0 space-y-2 break-words border-t border-ink-200 pt-4">
      <h2 id="reader-dictation" className="font-serif text-lg font-semibold text-ink-900">
        {t('gradedReader.dictation.title')}
      </h2>
      <p className="text-sm text-ink-600">{t('gradedReader.dictation.description')}</p>
      <Button
        variant="outline"
        className="h-auto min-h-10 min-w-40 max-w-full whitespace-normal break-words"
        disabled={working}
        aria-busy={working}
        aria-label={t('gradedReader.dictation.action')}
        onClick={() => void practise()}
      >
        <span className="inline-grid place-items-center">
          <span className={`col-start-1 row-start-1${working ? ' invisible' : ''}`}>
            {t('gradedReader.dictation.action')}
          </span>
          <span className="col-start-1 row-start-1 h-4 w-4" aria-hidden="true">
            {working && <Loader2 className="h-4 w-4 animate-spin" />}
          </span>
        </span>
      </Button>
      <div className="h-20 overflow-auto text-sm text-bad-700" role="status">
        {status.kind === 'error' && (
          <>
            <span className="break-words">{t('gradedReader.saveError', { msg: status.message })}</span>
            <Button variant="ghost" onClick={() => void practise()}>
              {t('common.retry')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
