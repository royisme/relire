/**
 * Prepares and saves a reader's rule-built transformation set before opening Practice; the shared saver owns
 * save-only retries, and the pressed button shows its own busy state in one fixed-height status slot.
 * The kinds and their answers are pure code (`services/exercises/transform`), so this needs no AI and no key.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import { useUnitSaver } from '../../hooks/useUnitSaver';
import { prepareReaderTransform } from '../../services/exercises/fromReaderTransform';
import type { PublishedReader } from '../../types/gradedReader';
import type { ReaderTransformKind } from '../../types/readerTransform';
import { Button } from '../ui/button';

export function ReaderTransformSection({ reader, kinds }: { reader: PublishedReader; kinds: ReaderTransformKind[] }) {
  const { t } = useTranslation();
  const { status, save } = useUnitSaver();
  const [pressed, setPressed] = useState<ReaderTransformKind | null>(null);
  const working = status.kind === 'working';
  async function practise(kind: ReaderTransformKind) {
    setPressed(kind);
    const units = await save(() => prepareReaderTransform({ reader, kind, t }));
    if (units) navigate({ name: 'practiceSet', area: 'grammar', setId: units[0].setId });
  }
  return (
    <section aria-labelledby="reader-transform" className="min-w-0 space-y-2 break-words border-t border-ink-200 pt-4">
      <h2 id="reader-transform" className="font-serif text-lg font-semibold text-ink-900">
        {t('gradedReader.transform.title')}
      </h2>
      <p className="text-sm text-ink-600">{t('gradedReader.transform.description')}</p>
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => {
          const busy = working && pressed === kind;
          return (
            <Button
              key={kind}
              variant="outline"
              className="h-auto min-h-10 min-w-40 max-w-full whitespace-normal break-words"
              disabled={working}
              aria-busy={busy}
              aria-label={t(`gradedReader.transform.${kind}`)}
              onClick={() => void practise(kind)}
            >
              <span className="inline-grid place-items-center">
                <span className={`col-start-1 row-start-1${busy ? ' invisible' : ''}`}>
                  {t(`gradedReader.transform.${kind}`)}
                </span>
                <span className="col-start-1 row-start-1 h-4 w-4" aria-hidden="true">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
      <div className="h-20 overflow-auto text-sm text-bad-700" role="status">
        {status.kind === 'error' && pressed && (
          <>
            <span className="break-words">{t('gradedReader.saveError', { msg: status.message })}</span>
            <Button variant="ghost" onClick={() => void practise(pressed)}>
              {t('common.retry')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
