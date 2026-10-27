/**
 * Settings → Words: wordbooks (list, study choice, deck delete), two learning preferences and the built-in
 * wordbook's download/update state. The page owns the unsaved values, so switching sections keeps them.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useVocabularyBook } from '../../hooks/useVocabularyBook';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet, OverlayHeader } from '../ui/overlay';
import { WordbooksBlock } from './WordbooksBlock';

/** The limit the text means (a whole number from 0 to 100), or null when it is not one. */
export function parseNewPerDay(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) <= 100 ? Number(value) : null;
}
export function parseRetentionPercent(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) >= 80 && Number(value) <= 95 ? Number(value) : null;
}

/**
 * The page's draft after a save of `submitted` finished: a newer edit stays, an unchanged draft is dropped.
 * Only the page can decide, because this section remounts when Settings switches sections.
 */
export function draftAfterSave(current: string | null, submitted: string | null): string | null {
  return current === submitted ? null : current;
}

interface WordsSectionProps {
  model: VocabularyModel;
  /** The page owns the unsaved text, so it outlives a section switch. */
  draft: {
    /** The unsaved text; null shows the saved preference. */
    value: string | null;
    retention: string | null;
    onChange: (value: string) => void;
    onRetentionChange: (value: string) => void;
    /** Each value is cleared only if it still holds the submitted text. */
    onSaved: (submitted: { newPerDay: string | null; retentionPercent: string | null }) => void;
  };
}

export function WordsSection({ model, draft }: WordsSectionProps) {
  const { t } = useTranslation();
  const content = useVocabularyBook();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const limit = draft.value ?? String(model.preferences.newPerDay);
  const retention = draft.retention ?? String(model.preferences.retentionPercent);
  const save = async () => {
    if (!model.ready || model.error || saving) return;
    const next = parseNewPerDay(limit);
    if (next === null) {
      setStatus(t('vocab.invalidLimit'));
      return;
    }
    // The text this save submits; the learner may type again while it is in flight.
    const retentionPercent = parseRetentionPercent(retention);
    if (retentionPercent === null) {
      setStatus(t('vocab.invalidRetention'));
      return;
    }
    const submitted = { newPerDay: draft.value, retentionPercent: draft.retention };
    setSaving(true);
    setStatus(null);
    try {
      // The study-book choice is saved on its own; this save must keep it.
      await model.savePreferences({ ...model.preferences, newPerDay: next, retentionPercent });
      // A newer edit stays unsaved on screen; only the page can tell, since this section may have remounted.
      draft.onSaved(submitted);
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
      <WordbooksBlock model={model} book={content.book} />
      <section className="space-y-3 border-t border-ink-200 pt-6">
        <label htmlFor="vocabulary-limit" className="block text-sm">
          {t('vocab.newLimit')}
        </label>
        <div>
          <Input
            id="vocabulary-limit"
            className="w-24"
            type="number"
            min={0}
            max={100}
            step={1}
            value={limit}
            disabled={!model.ready}
            onChange={(event) => draft.onChange(event.target.value)}
          />
        </div>
        <label htmlFor="vocabulary-retention" className="block text-sm">
          {t('vocab.retention')}
        </label>
        <Input
          id="vocabulary-retention"
          className="w-24"
          type="number"
          min={80}
          max={95}
          step={1}
          value={retention}
          disabled={!model.ready}
          onChange={(event) => draft.onRetentionChange(event.target.value)}
        />
        <p className="text-sm text-ink-600">{t('vocab.retentionHelp')}</p>
        <p className="text-sm text-ink-600">{t('vocab.outcomeHelp')}</p>
        <Button
          variant="outline"
          className="w-28"
          disabled={saving || !model.ready || !!model.error}
          onClick={() => void save()}
        >
          {t(saving ? 'vocab.saving' : 'common.save')}
        </Button>
        <p className="h-12 overflow-auto break-words text-sm text-ink-600" role="status">
          {model.error ?? status}
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
