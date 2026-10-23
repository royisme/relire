/**
 * Body of the word sheet for a graded reader: the clicked spelling, the authored entry behind it (lemma, part of
 * speech, gender, meaning), the sentence it was tapped in with its authored translation, and the save cells.
 * Presentational and controlled: it owns no lookup, no AI, no lexicon and no speech; the caller supplies the
 * membership state and handlers, and the footer slots exist from the first frame so nothing moves.
 */
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReaderGlossaryEntry, Sentence } from '../../types/gradedReader';
import { authoredText } from '../../utils/authoredText';
import { Button } from '../ui/button';
import { Section } from './Section';

export type AuthoredSaveState = 'unsaved' | 'saved' | 'contextSaved';

interface AuthoredEntryProps {
  /** The full spelling that was tapped, which is the vocabulary identity, not the lemma. */
  spelling: string;
  entry: ReaderGlossaryEntry;
  /** The sentence the word was tapped in, with the reader's authored translation. */
  sentence: Pick<Sentence, 'fr' | 'translation'>;
  saved: AuthoredSaveState;
  onSave: () => void;
  onRemove: () => void;
  pending?: boolean;
  error?: string | null;
  /** Room for a later optional disclosure, such as dictionary forms. */
  extra?: ReactNode;
}

export function AuthoredEntry({
  spelling,
  entry,
  sentence,
  saved,
  onSave,
  onRemove,
  pending = false,
  error = null,
  extra,
}: AuthoredEntryProps) {
  const { t, i18n } = useTranslation();
  // Retry repeats the action that failed, so a failed removal never becomes a save.
  const lastAction = useRef(onSave);
  const save = () => {
    lastAction.current = onSave;
    onSave();
  };
  const remove = () => {
    lastAction.current = onRemove;
    onRemove();
  };
  const lemmaDiffers = entry.lemma.toLowerCase() !== spelling.toLowerCase();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-6 space-y-5">
        <header className="space-y-3">
          <div className="min-w-0">
            <h2 className="font-serif text-3xl font-semibold text-ink-900 break-words">{spelling}</h2>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-500">
              <span>{t(`gradedReader.pos.${entry.pos}`)}</span>
              {entry.gender && <span>{t(`gradedReader.gender.${entry.gender}`)}</span>}
              {lemmaDiffers && (
                <span>
                  {t('wordModal.lemma')} <span className="font-serif text-ink-800">{entry.lemma}</span>
                </span>
              )}
              <span className="rounded-md border border-ink-300 px-1.5 text-xs leading-5">
                {t('gradedReader.authored')}
              </span>
            </p>
          </div>
          <p className="text-lg font-medium text-ink-900 break-words">{authoredText(entry.gloss, i18n.language)}</p>
        </header>

        <Section title={t('wordModal.originalSentence')}>
          <p className="font-serif text-base text-ink-900 leading-relaxed break-words">« {sentence.fr} »</p>
          <p className="text-sm text-ink-600 break-words">
            <span className="text-xs text-ink-500 mr-1.5">{t('sentenceDrawer.translation')}:</span>
            {authoredText(sentence.translation, i18n.language)}
          </p>
        </Section>

        {extra}
      </div>

      <footer className="space-y-2 border-t border-ink-200 bg-surface px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="whitespace-normal"
            disabled={pending || saved === 'contextSaved'}
            variant={saved === 'contextSaved' ? 'outline' : 'default'}
            onClick={save}
          >
            {t(
              saved === 'contextSaved'
                ? 'vocab.contextSaved'
                : saved === 'saved'
                  ? 'vocab.saveContext'
                  : 'vocab.saveWord',
            )}
          </Button>
          <Button
            className="whitespace-normal"
            variant="outline"
            disabled={pending || saved === 'unsaved'}
            aria-describedby="authored-remove-help"
            onClick={remove}
          >
            {t('vocab.removeBookmark')}
          </Button>
        </div>
        <p id="authored-remove-help" className="text-xs text-ink-600">
          {t('vocab.removeHelp')}
        </p>
        <div
          role="status"
          aria-live="polite"
          className="flex h-12 items-start gap-2 overflow-auto text-sm text-bad-700"
        >
          {pending ? (
            <span className="break-words">{t('vocab.saving')}</span>
          ) : error ? (
            <>
              <span className="min-w-0 break-words">{error}</span>
              <Button variant="outline" size="sm" className="min-h-10 shrink-0" onClick={() => lastAction.current()}>
                {t('common.retry')}
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
