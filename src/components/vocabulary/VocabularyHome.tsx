/** Today: truthful introduced-card counts, explicit quota preference and a permanently reserved download status. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import type { VocabularyBookModel } from '../../hooks/useVocabularyBook';
import { vocabularyDue } from '../../utils/srs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Link } from '../shell/Link';
import { Sheet, OverlayHeader } from '../ui/overlay';
export function VocabularyHome({ model, content }: { model: VocabularyModel; content: VocabularyBookModel }) {
  const { t } = useTranslation();
  const [draftLimit, setLimit] = useState<string | null>(null);
  const limit = draftLimit ?? String(model.preferences.newPerDay);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const due = model.rows.filter((row) => vocabularyDue(row.schedule, model.now)).length;
  const learning = model.rows.filter((row) => row.schedule && row.schedule.phase !== 'review').length;
  const remaining = Math.max(0, model.preferences.newPerDay - model.day.introducedKeys.length);
  const save = async () => {
    if (!/^\d+$/.test(limit) || Number(limit) > 100) {
      setStatus(t('vocab.invalidLimit'));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await model.savePreferences(Number(limit));
      setLimit(null);
      setStatus(t('vocab.saved'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {[
          [t('vocab.due'), due],
          [t('vocab.learning'), learning],
          [t('vocab.remaining'), remaining],
        ].map(([label, count]) => (
          <div key={label}>
            <dt className="text-ink-600">{label}</dt>
            <dd className="tnum text-lg">{count}</dd>
          </div>
        ))}
      </dl>
      <Link
        to={{ name: 'wordsReview' }}
        className="inline-flex min-h-10 items-center rounded-md bg-accent-700 px-4 text-sm text-on-fill"
      >
        {t('vocab.continue')}
      </Link>
      <section className="space-y-3 border-t border-ink-200 pt-6">
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
            onChange={(event) => setLimit(event.target.value)}
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
