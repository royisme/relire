/**
 * Settings → Words: the daily introduction limit and the built-in wordbook's download/update state.
 * The page owns the unsaved limit text, so switching sections keeps it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useVocabularyBook } from '../../hooks/useVocabularyBook';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet, OverlayHeader } from '../ui/overlay';

/** The limit the text means (a whole number from 0 to 100), or null when it is not one. */
export function parseNewPerDay(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) <= 100 ? Number(value) : null;
}

interface WordsSectionProps {
  model: VocabularyModel;
  /** `value` is the unsaved text; null shows the saved preference. */
  draft: { value: string | null; onChange: (value: string | null) => void };
}

export function WordsSection({ model, draft }: WordsSectionProps) {
  const { t } = useTranslation();
  const content = useVocabularyBook();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const limit = draft.value ?? String(model.preferences.newPerDay);
  const save = async () => {
    const next = parseNewPerDay(limit);
    if (next === null) {
      setStatus(t('vocab.invalidLimit'));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await model.savePreferences(next);
      draft.onChange(null);
      setStatus(t('vocab.saved'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">{t('vocab.book')}</h2>
        <p className="text-sm text-ink-600">
          {content.book
            ? t('vocab.bookCount', { count: content.book.manifest.entryCount })
            : t('vocab.bookUnavailable')}
        </p>
        <Button
          variant="outline"
          className="w-64 max-w-full"
          disabled={!content.configured || content.busy}
          onClick={() => void content.download()}
        >
          {t(
            content.busy
              ? 'vocab.downloading'
              : content.restart
                ? 'vocab.restart'
                : content.book
                  ? 'vocab.update'
                  : 'vocab.download',
          )}
        </Button>
        <div
          data-vocabulary-download-status
          className="flex h-16 min-w-0 items-start gap-2 overflow-hidden text-sm text-ink-600"
          role="status"
          aria-live="polite"
        >
          {content.error ? (
            <>
              <span className="line-clamp-2 min-w-0 flex-1 break-words text-bad-700">{content.error}</span>
              <Button
                variant="ghost"
                className="w-28 shrink-0 whitespace-normal px-2 text-xs"
                onClick={() => setDetails(true)}
              >
                {t('vocab.errorDetails')}
              </Button>
            </>
          ) : content.progress ? (
            t('vocab.downloadProgress', content.progress)
          ) : !content.configured ? (
            t('vocab.updatesUnavailable')
          ) : null}
        </div>
      </section>
      <section className="space-y-3 border-t border-ink-200 pt-6">
        <label htmlFor="vocabulary-limit" className="block text-sm">
          {t('vocab.newLimit')}
        </label>
        <div className="flex gap-2">
          <Input
            id="vocabulary-limit"
            className="w-24"
            type="number"
            min={0}
            max={100}
            step={1}
            value={limit}
            onChange={(event) => draft.onChange(event.target.value)}
          />
          <Button variant="outline" className="w-28" disabled={saving} onClick={() => void save()}>
            {t(saving ? 'vocab.saving' : 'common.save')}
          </Button>
        </div>
        <p className="h-12 overflow-auto break-words text-sm text-ink-600" role="status">
          {status}
        </p>
      </section>
      {details && (
        <Sheet label={t('vocab.errorDetails')} onClose={() => setDetails(false)}>
          <OverlayHeader
            title={t('vocab.errorDetails')}
            closeLabel={t('common.close')}
            onClose={() => setDetails(false)}
          />
          <p role="alert" className="overflow-auto break-words p-5 text-sm text-bad-700">
            {content.error}
          </p>
        </Sheet>
      )}
    </div>
  );
}
