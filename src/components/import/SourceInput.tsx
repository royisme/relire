/** Local source selection and the exact outbound-content consent; requests are owned by useImportSource. */
import { useTranslation } from 'react-i18next';
import type { useImportSource } from '../../hooks/useImportSource';
import { TextField, field } from './fields';
import { Button } from '../ui/button';
import { Link } from '../shell/Link';
export function SourceInput({ source }: { source: ReturnType<typeof useImportSource> }) {
  const { t } = useTranslation();
  const busy = source.phase !== 'idle';
  // Images and PDFs read the OCR selection; pasted text asks the text selection for its settings.
  const purpose = source.purpose === 'ocr' ? 'ocr' : 'text';
  return (
    <section className="space-y-4 min-w-0">
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <label className="block text-sm space-y-2">
          {t('importFlow.choose')}
          <input
            className={field}
            type="file"
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
          <p className="text-sm break-words">
            {t('importFlow.localFile', { name: source.material.source.name, count: source.material.pageCount })}
          </p>
        )}
        {source.material?.source.kind === 'pdf' && (
          <TextField label={t('importFlow.pages')} value={source.pages} onChange={source.setPages} />
        )}
        <TextField
          label={t('importFlow.text')}
          multiline
          value={source.text}
          maxLength={40000}
          onChange={source.setText}
        />
        <label className="block text-sm">
          {t('importFlow.mode')}
          <select
            aria-label={t('importFlow.mode')}
            className={field}
            value={source.mode}
            onChange={(e) => source.setMode(e.target.value as typeof source.mode)}
          >
            {(['complete', 'extract', 'generate'] as const).map((mode) => (
              <option key={mode} value={mode}>
                {t(`importFlow.modes.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink-700">{t(`importFlow.modeHelp.${source.mode}`)}</p>
      </fieldset>
      <section className="border-y border-ink-200 py-4 space-y-2" aria-label={t('importFlow.consent')}>
        <h2 className="font-serif text-lg font-semibold">{t('importFlow.consent')}</h2>
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
        <p className="text-sm">{t('importFlow.sentText', { count: source.text.trim().length })}</p>
        <details>
          <summary className="cursor-pointer text-sm">{t('importFlow.exactText')}</summary>
          <pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto text-sm">{source.text.trim()}</pre>
        </details>
        {purpose === 'ocr' && source.model.capabilities.imageInput === 'unknown' && (
          <p className="text-sm text-ink-700">{t('aiSettings.unknownOcr')}</p>
        )}
        {source.unsupported && <p className="text-sm text-bad-700">{t('importFlow.unsupported')}</p>}
        <Link
          className="text-sm underline text-accent-900"
          to={{ name: 'settings', section: 'ai', purpose, focusKey: true, returnTo: '#/import' }}
        >
          {t('aiSettings.purposeSettings', { purpose: t(`aiSettings.purposes.${purpose}`) })}
        </Link>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          className="w-44"
          disabled={busy || source.unsupported || !!source.pageError || (!source.material && !source.text.trim())}
          onClick={() => void source.analyze()}
        >
          {t(busy ? 'importFlow.working' : 'importFlow.analyze')}
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
