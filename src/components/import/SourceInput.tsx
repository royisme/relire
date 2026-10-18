/**
 * Local source selection and the exact outbound-content consent, shared by both import pages; requests are owned by
 * useImportSource. The article page sends only a chosen file (pasted text never leaves the device) and lets one
 * input at a time stand; the exercise page sends the text too and takes extra controls (the mode) as children.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { useImportSource } from '../../hooks/useImportSource';
import { routeHref, type Route } from '../../utils/routes';
import { TextField, field } from './fields';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';

export type ImportKind = 'article' | 'exercises';

interface SourceInputProps {
  kind: ImportKind;
  source: ReturnType<typeof useImportSource<unknown>>;
  /** The page itself: where Settings returns to. */
  page: Route;
  children?: ReactNode;
}

export function SourceInput({ kind, source, page, children }: SourceInputProps) {
  const { t } = useTranslation();
  const busy = source.phase !== 'idle';
  const article = kind === 'article';
  const ns = article ? 'importArticle' : 'importExercises';
  // Images and PDFs read the OCR selection; pasted text asks the text selection for its settings (exercises only).
  const purpose = source.purpose;
  const pastedText = source.text.trim().length > 0;
  return (
    <section className="space-y-4 min-w-0">
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <label className="block text-sm space-y-2">
          {t('importFlow.choose')}
          <input
            className={field}
            type="file"
            disabled={article && pastedText}
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void source.choose(file);
              e.target.value = '';
            }}
          />
        </label>
        <p className="text-sm text-ink-600">{t('importFlow.dropHelp')}</p>
        {source.material && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm break-words min-w-0">
              {t('importFlow.localFile', { name: source.material.source.name, count: source.material.pageCount })}
            </p>
            {article && (
              <Button type="button" variant="outline" size="sm" onClick={source.clearMaterial}>
                {t('importArticle.removeFile')}
              </Button>
            )}
          </div>
        )}
        {source.material?.source.kind === 'pdf' && (
          <TextField label={t('importFlow.pages')} value={source.pages} onChange={source.setPages} />
        )}
        <TextField
          label={t(`${ns}.text`)}
          multiline
          disabled={article && !!source.material}
          value={source.text}
          maxLength={40000}
          onChange={source.setText}
        />
        {children}
      </fieldset>
      <section className="border-y border-ink-200 py-4 space-y-2" aria-label={t(`${ns}.consent`)}>
        <h2 className="font-serif text-lg font-semibold">{t(`${ns}.consent`)}</h2>
        {article && !source.material ? (
          <p className="text-sm">{t('importArticle.localOnly')}</p>
        ) : (
          <>
            <p className="text-sm break-words">
              {t('importFlow.recipient', {
                provider: t(`providers.${source.model.providerId}`),
                model: source.model.model,
              })}
            </p>
            <p className="text-sm">
              {t('importFlow.sentPages', {
                pages: source.selectedPages.join(', ') || t('importFlow.none'),
                name: source.material?.source.name ?? t('importFlow.none'),
              })}
            </p>
          </>
        )}
        {!article && (
          <>
            <p className="text-sm">{t('importExercises.sentText', { count: source.text.trim().length })}</p>
            <details>
              <summary className="cursor-pointer text-sm">{t('importExercises.exactText')}</summary>
              <pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto text-sm">{source.text.trim()}</pre>
            </details>
          </>
        )}
        {source.material && source.model.capabilities.imageInput === 'unknown' && (
          <p className="text-sm text-ink-700">{t('aiSettings.unknownOcr')}</p>
        )}
        {source.unsupported && <p className="text-sm text-bad-700">{t('importFlow.unsupported')}</p>}
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
          disabled={busy || source.unsupported || !!source.pageError || (!source.material && !pastedText)}
          onClick={() => void source.analyze()}
        >
          {t(busy ? 'importFlow.working' : article && !source.material ? 'importArticle.continue' : `${ns}.analyze`)}
        </Button>
        <Button variant="outline" disabled={!busy} onClick={source.cancel}>
          {t('common.cancel')}
        </Button>
      </div>
      <p role="status" className="h-16 overflow-auto text-sm text-bad-700 break-words">
        {source.pageError || source.error}
      </p>
    </section>
  );
}
