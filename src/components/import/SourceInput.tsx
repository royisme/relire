/** Shared local source controls and exact outbound consent; the hooks own material lifetime, requests and discard. */
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { useImportSource } from '../../hooks/useImportSource';
import { MAX_EXTRACT_IMAGES } from '../../services/ai/tasks';
import { routeHref, type Route } from '../../utils/routes';
import { TextField } from './fields';
import { SourceThumbnails } from './SourceThumbnails';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';
import { cn } from '../../lib/utils';

export type ImportKind = 'article' | 'exercises';

interface SourceInputProps {
  kind: ImportKind;
  source: ReturnType<typeof useImportSource<unknown>>;
  /** The page itself: where Settings returns to. */
  page: Route;
  children?: ReactNode;
  onDiscard: () => void;
  leaveOpen: boolean;
}

export function SourceInput({ kind, source, page, children, onDiscard, leaveOpen }: SourceInputProps) {
  const { t } = useTranslation();
  const busy = source.phase !== 'idle';
  const article = kind === 'article';
  const ns = article ? 'importArticle' : 'importExercises';
  const purpose = source.purpose;
  const pastedText = source.text.trim().length > 0;
  const discardable = source.hasMaterial || !!source.text || !!source.error || !!source.pageError;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // One error state serves two origins; the run that set it (opening or extracting) says which slot renders it.
  // The error and the return to idle arrive in one batch, so the transition's origin decides.
  const [lastPhase, setLastPhase] = useState(source.phase);
  const [extraction, setExtraction] = useState(false);
  if (source.phase !== lastPhase) {
    setLastPhase(source.phase);
    setExtraction(lastPhase === 'extracting' ? !!source.error : source.phase === 'extracting');
  }
  const choosable = !busy && !(article && pastedText);
  return (
    <section className="space-y-4 min-w-0" inert={leaveOpen} aria-hidden={leaveOpen}>
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <div
          className={cn(
            'flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border bg-ink-50 px-4 py-5 text-center',
            dragOver ? 'border-accent-600' : 'border-ink-300',
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (choosable) setDragOver(true);
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
              setDragOver(false);
          }}
          onDrop={() => setDragOver(false)}
        >
          <Button
            type="button"
            variant="outline"
            disabled={article && pastedText}
            onClick={() => fileInput.current?.click()}
          >
            {t('importFlow.chooseImages')}
          </Button>
          <p className="text-sm text-ink-600 break-words">{t('importFlow.dropHere', { limit: MAX_EXTRACT_IMAGES })}</p>
          {/* Hidden but named: keyboard users and smoke scripts reach the same picker the button opens. */}
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            multiple
            aria-label={t('importFlow.choose')}
            disabled={article && pastedText}
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => {
              if (e.target.files) void source.choose(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </div>
        <p className="text-sm text-ink-600">{t('importFlow.readingOrder')}</p>
        <SourceThumbnails
          materials={source.materials}
          pages={source.selectedPages}
          onRemove={source.removeMaterial}
          onError={source.setError}
        />
        <p role="alert" className="h-6 overflow-y-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
          {source.pageError || (!extraction && source.error)}
        </p>
        <div className="h-30 space-y-2 min-w-0">
          {source.pdf && (
            <>
              <div className="flex items-start gap-2 min-w-0">
                <p className="text-sm break-words min-w-0 flex-1 h-10 overflow-auto">
                  {t('importFlow.localFile', { name: source.pdf.source.name, count: source.pdf.pageCount })}
                </p>
                <Button type="button" variant="outline" className="shrink-0" onClick={source.clearMaterial}>
                  {t('importFlow.removeFile')}
                </Button>
              </div>
              <TextField
                label={t('importFlow.pages', { limit: MAX_EXTRACT_IMAGES })}
                value={source.pages}
                onChange={source.setPages}
              />
            </>
          )}
        </div>
        <TextField
          label={t(`${ns}.text`)}
          multiline
          disabled={article && source.hasMaterial}
          value={source.text}
          maxLength={40000}
          onChange={source.setText}
        />
        <div className="h-10">
          {!!source.text && (
            <Button type="button" variant="outline" onClick={() => source.setText('')}>
              {t('importFlow.clearText')}
            </Button>
          )}
        </div>
        {children}
      </fieldset>
      <section className="border-y border-ink-200 py-4 space-y-2" aria-label={t(`${ns}.consent`)}>
        <h2 className="font-serif text-lg font-semibold">{t(`${ns}.consent`)}</h2>
        <div className="h-20 overflow-y-auto space-y-1">
          {article && !source.hasMaterial ? (
            <p className="text-sm">{t('importArticle.localOnly')}</p>
          ) : (
            <>
              <p className="text-sm break-words">
                {t('importFlow.recipient', {
                  provider: t(`providers.${source.model.providerId}`),
                  model: source.model.model,
                })}
              </p>
              <p className="text-sm break-words">
                {!source.hasMaterial
                  ? t('importFlow.none')
                  : source.pdf
                    ? t('importFlow.sentPdf', {
                        pages: source.selectedPages.join(', ') || t('importFlow.none'),
                      })
                    : t('importFlow.sentImages', { count: source.materials.length })}
              </p>
            </>
          )}
        </div>
        {!article && (
          <>
            <p className="text-sm">{t('importExercises.sentText', { count: source.text.trim().length })}</p>
            <details>
              <summary className="cursor-pointer text-sm">{t('importExercises.exactText')}</summary>
              <pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto text-sm">{source.text.trim()}</pre>
            </details>
          </>
        )}
        <div className="h-12 overflow-auto">
          {source.hasMaterial && source.model.capabilities.imageInput === 'unknown' && (
            <p className="text-sm text-ink-700">{t('aiSettings.unknownOcr')}</p>
          )}
          {source.unsupported && <p className="text-sm text-bad-700">{t('importFlow.unsupported')}</p>}
        </div>
        <Link
          className="text-sm underline text-accent-900"
          to={{ name: 'settings', section: 'ai', purpose, focusKey: true, returnTo: routeHref(page) }}
        >
          {t('aiSettings.purposeSettings', { purpose: t(`aiSettings.purposes.${purpose}`) })}
        </Link>
      </section>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          className="w-44 max-sm:w-full"
          disabled={busy || source.unsupported || !!source.pageError || (!source.hasMaterial && !pastedText)}
          onClick={() => void source.analyze()}
        >
          {t(busy ? 'importFlow.working' : article && !source.hasMaterial ? 'importArticle.continue' : `${ns}.analyze`)}
        </Button>
        <Button variant="outline" disabled={!busy} onClick={source.cancel}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="ghost"
          className={discardable ? '' : 'invisible'}
          aria-hidden={!discardable}
          disabled={busy || !discardable}
          onClick={onDiscard}
        >
          {t('importFlow.discard')}
        </Button>
      </div>
      <p role="status" className="h-6 overflow-y-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
        {extraction ? source.error : ''}
      </p>
    </section>
  );
}
