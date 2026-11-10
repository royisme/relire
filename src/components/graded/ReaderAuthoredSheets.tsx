/** Authored word/sentence sheets for a captured occurrence; no lookup hook, no automatic AI request and no
 * Settings redirect — the optional Ask AI is explicit, configured-only and self-contained. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sentence } from '../../types/gradedReader';
import type { ReaderOccurrence } from '../../services/gradedReaders/occurrence';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useVocabularyBookmark } from '../../hooks/useVocabularyBookmark';
import { authoredText } from '../../utils/authoredText';
import { AuthoredEntry } from '../word/AuthoredEntry';
import { SentenceAuthored } from '../SentenceAuthored';
import { AuthoredAskAi } from './AuthoredAskAi';
import { Sheet, OverlayHeader } from '../ui/overlay';
import { SpeakButton } from '../ui/speak-button';

export type AuthoredSelection =
  | { kind: 'word'; occurrence: ReaderOccurrence }
  | { kind: 'sentence'; sentence: Sentence }
  | { kind: 'error'; error: string };

export function ReaderAuthoredSheets({
  selection,
  text,
  vocabulary,
  onClose,
}: {
  selection: AuthoredSelection;
  /** The reader's full text: the context an optional explicit Ask AI request is made with. */
  text: string;
  vocabulary: VocabularyModel;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const occurrence = selection.kind === 'word' ? selection.occurrence : null;
  const bookmark = useVocabularyBookmark(vocabulary, occurrence?.lookup ?? null, occurrence?.definition ?? null);
  const title = t(selection.kind === 'word' ? 'gradedReader.word' : 'gradedReader.translation');
  return (
    <Sheet onClose={onClose} label={title}>
      <OverlayHeader title={title} onClose={onClose} closeLabel={t('common.close')} />
      {occurrence ? (
        <AuthoredEntry
          spelling={occurrence.lookup.word}
          entry={occurrence.entries[0]}
          sentence={occurrence.sentence}
          saved={bookmark.contextSaved ? 'contextSaved' : bookmark.saved ? 'saved' : 'unsaved'}
          pending={bookmark.busy}
          error={bookmark.error}
          onSave={() => {
            void bookmark.save();
          }}
          onRemove={() => {
            void bookmark.remove();
          }}
          extra={
            <div className="space-y-3">
              {occurrence.entries.slice(1).map((entry) => (
                <p key={entry.id} className="text-sm break-words">
                  <span className="font-serif">{entry.lemma}</span> · {t(`gradedReader.pos.${entry.pos}`)} ·{' '}
                  {authoredText(entry.gloss, i18n.language)}
                </p>
              ))}
              <SpeakButton
                text={occurrence.lookup.word}
                engine="device"
                stopLabel={t('reader.stop')}
                label={t('gradedReader.deviceVoice')}
                variant="outline"
              />
              <AuthoredAskAi
                subject={{
                  kind: 'word',
                  word: occurrence.lookup.word,
                  sentence: occurrence.sentence.fr,
                  text,
                }}
              />
            </div>
          }
        />
      ) : selection.kind === 'sentence' ? (
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <SentenceAuthored
            sentence={selection.sentence}
            revealed={revealed}
            onToggle={() => setRevealed((value) => !value)}
            extra={
              <>
                <SpeakButton
                  text={selection.sentence.fr}
                  engine="device"
                  stopLabel={t('reader.stop')}
                  label={t('gradedReader.deviceVoice')}
                  variant="outline"
                />
                <AuthoredAskAi subject={{ kind: 'sentence', sentence: selection.sentence.fr, text }} />
              </>
            }
          />
        </div>
      ) : selection.kind === 'error' ? (
        <p role="alert" className="h-32 overflow-auto p-4 break-words text-bad-700">
          {t('gradedReader.bindingError', { msg: selection.error })}
        </p>
      ) : null}
    </Sheet>
  );
}
