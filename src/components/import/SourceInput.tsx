/** Shared local source controls and exact outbound consent; the hooks own material lifetime, requests and discard. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { useImportSource } from '../../hooks/useImportSource';
import { MAX_EXTRACT_IMAGES } from '../../services/ai/tasks';
import { routeHref, type Route } from '../../utils/routes';
import { TextField, field } from './fields';
import { SourceThumbnails } from './SourceThumbnails';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';

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
  return (
    <section className="space-y-4 min-w-0" inert={leaveOpen} aria-hidden={leaveOpen}>
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <label className="block text-sm space-y-2">
          {t('importFlow.choose')}
          <input
            className={field}
            type="file"
            multiple
            disabled={article && pastedText}
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => {
              if (e.target.files) void source.choose(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
        </label>
        <p className="text-sm text-ink-600">{t('importFlow.dropHelp', { limit: MAX_EXTRACT_IMAGES })}</p>
        <p className="text-sm text-ink-600">{t('importFlow.readingOrder')}</p>
        <SourceThumbnails
          materials={source.materials}
          pages={source.selectedPages}
          onRemove={source.removeMaterial}
          onError={source.setError}
        />
        <div className="h-32 space-y-2 min-w-0">
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
        <div className="h-36 overflow-auto space-y-2">
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
              <div className="h-24 overflow-auto text-sm break-words min-w-0">
                {source.hasMaterial ? (
                  source.materials.map((material, index) => (
                    <p key={index}>
                      {t('importFlow.sentPages', {
                        order: index + 1,
                        pages:
                          material.source.kind === 'pdf'
                            ? source.selectedPages.join(', ') || t('importFlow.none')
                            : '1',
                        name: material.source.name,
                      })}
                    </p>
                  ))
                ) : (
                  <p>{t('importFlow.none')}</p>
                )}
              </div>
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
      <div className="flex flex-wrap gap-2">
        <Button
          className="w-44"
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
      <p role="status" className="h-16 overflow-auto whitespace-pre-wrap text-sm text-bad-700 break-words">
        {source.pageError || source.error}
      </p>
    </section>
  );
}
