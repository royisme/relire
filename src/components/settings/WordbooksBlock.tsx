/**
 * Settings → Words, Wordbooks: the learner's wordbooks (My words first, the built-in
 * book when downloaded, then one row per imported deck), the one-wordbook study
 * choice (saved at once, with its own fixed-height status slot) and deck deletion
 * behind a confirmation dialog that says what progress goes.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import type { VocabularyBook } from '../../types/vocabulary';
import { errorMessage } from '../../services/ai/errors';
import {
  BUILTIN_WORDS,
  MY_WORDS,
  deckStudyBook,
  deckSummaries,
  effectiveStudyBook,
  inMyWords,
  type DeckSummary,
} from '../../services/vocabulary/wordbooks';
import { deleteVocabularyDeck } from '../../storage/vocabulary';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';

interface WordbookRowProps {
  value: string;
  title: string;
  count: number;
  /** The model is still loading, so the count is not real yet. */
  waiting: boolean;
  checked: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
  /** Present only on imported decks; the button sits outside the label so it never picks the radio. */
  onDelete?: () => void;
  deleteLabel?: string;
}

function WordbookRow({
  value,
  title,
  count,
  waiting,
  checked,
  disabled,
  onSelect,
  onDelete,
  deleteLabel,
}: WordbookRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-1">
      <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          type="radio"
          name="vocabulary-study-book"
          className="h-4 w-4 shrink-0 accent-accent-700"
          checked={checked}
          disabled={disabled}
          onChange={() => onSelect(value)}
        />
        <span className="min-w-0 flex-1 truncate text-sm" title={title}>
          {title}
        </span>
        <span className="tnum shrink-0 text-sm text-ink-600">
          {waiting ? '–' : t('vocab.wordbooks.words', { count })}
        </span>
      </label>
      {onDelete && (
        <Button
          variant="ghost"
          size="iconSm"
          className="shrink-0"
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

export function WordbooksBlock({ model, book }: { model: VocabularyModel; book: VocabularyBook | undefined }) {
  const { t } = useTranslation();
  const decks = deckSummaries(model.rows);
  const mine = model.rows.filter(inMyWords).length;
  const selected = effectiveStudyBook(model.preferences.studyBook, book, model.rows);
  // The choice being saved stays marked until its own save settles (a newer choice supersedes it);
  // success resolves only after the model reloaded, so the radio never flickers back.
  const latest = useRef(0);
  const [pending, setPending] = useState<{ value: string; failed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<DeckSummary | null>(null);
  const pendingValue = pending && !pending.failed ? pending.value : null;
  const saving = pendingValue !== null;
  const shown = saving ? pendingValue : selected;
  // A save before the preferences load would write the defaults over the learner's limits.
  const locked = saving || !model.ready || !!model.error;
  const choose = async (studyBook: string) => {
    if (saving || studyBook === model.preferences.studyBook) return;
    const request = ++latest.current;
    setPending({ value: studyBook, failed: false });
    setError(null);
    try {
      await model.savePreferences({ ...model.preferences, studyBook });
      if (latest.current === request) setPending(null);
    } catch (cause) {
      if (latest.current === request) {
        setPending({ value: studyBook, failed: true });
        setError(errorMessage(cause));
      }
    }
  };
  return (
    <section className="space-y-3 border-t border-ink-200 pt-6">
      <h2 className="font-serif text-lg font-semibold">{t('vocab.wordbooks.title')}</h2>
      <p className="text-sm text-ink-600">{t('vocab.wordbooks.help')}</p>
      <div className="space-y-1" role="radiogroup" aria-label={t('vocab.wordbooks.study')}>
        <WordbookRow
          value={MY_WORDS}
          title={t('vocab.wordbooks.mine')}
          count={mine}
          waiting={!model.ready}
          checked={shown === MY_WORDS}
          disabled={locked}
          onSelect={(value) => void choose(value)}
        />
        {model.ready && mine === 0 && <p className="pl-6 text-sm text-ink-600">{t('vocab.wordbooks.mineEmpty')}</p>}
        {book && (
          <WordbookRow
            value={BUILTIN_WORDS}
            title={t('vocab.book')}
            count={book.manifest.entryCount}
            waiting={!model.ready}
            checked={shown === BUILTIN_WORDS}
            disabled={locked}
            onSelect={(value) => void choose(value)}
          />
        )}
        {decks.map((deck) => (
          <WordbookRow
            key={deck.id}
            value={deckStudyBook(deck.id)}
            title={deck.title}
            count={deck.words}
            waiting={!model.ready}
            checked={shown === deckStudyBook(deck.id)}
            disabled={locked}
            onSelect={(value) => void choose(value)}
            onDelete={() => setConfirming(deck)}
            deleteLabel={t('vocab.wordbooks.deleteLabel', { name: deck.title })}
          />
        ))}
      </div>
      <p className="h-12 overflow-auto break-words text-sm text-ink-600" role="status" aria-live="polite">
        {saving ? t('vocab.wordbooks.saving') : error ? <span className="text-bad-700">{error}</span> : null}
      </p>
      {confirming && <DeleteDeckDialog deck={confirming} onClose={() => setConfirming(null)} />}
    </section>
  );
}

function DeleteDeckDialog({ deck, onClose }: { deck: DeckSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = () => {
    if (!busy) onClose();
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteVocabularyDeck(deck.id);
      onClose();
    } catch (cause) {
      setError(t('vocab.wordbooks.deleteFailed', { reason: errorMessage(cause) }));
      setBusy(false);
    }
  };
  return (
    <Dialog onClose={cancel} label={t('vocab.wordbooks.confirmTitle')} className="max-w-sm">
      <OverlayHeader title={t('vocab.wordbooks.confirmTitle')} closeLabel={t('common.close')} onClose={cancel} />
      <div className="space-y-4 p-5">
        <p className="break-words text-sm text-ink-700">
          {t('vocab.wordbooks.confirmBody', { name: deck.title, words: deck.words, history: deck.withHistory })}
        </p>
        <p className="break-words text-sm text-ink-700">{t('vocab.wordbooks.confirmShared')}</p>
        {error && (
          <p role="alert" className="break-words text-sm text-bad-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{t('vocab.wordbooks.confirmDelete')}</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
