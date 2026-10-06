import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from './ui/overlay';
import { X, Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { WordAnalysis } from '../types';
import { toggleSpeech } from '../utils/speech';
import { Button } from './ui/button';
import { SpeakButton, SpeakIcon, useSpeechPhase } from './ui/speak-button';

/**
 * The word lookup sheet, laid out like a dictionary entry: the word, how it sounds and what it means
 * here, then plain sections (pronunciation, use in this sentence, conjugation, examples). Sections are
 * separated by rules, not tinted boxes.
 */

interface WordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  wordData: WordAnalysis | null;
  isLoading: boolean;
  contextSentence: string;
  isSavedInVocab: boolean;
  onToggleVocab: (wordData: WordAnalysis, contextSentence: string) => void;
  onRetry?: () => void;
  activeWord?: string | null;
  errorMessage?: string | null;
}

/** One conjugated form; pressing it speaks the form, and its icon shows loading / playing in place. */
const FormTile: React.FC<{ person: string; form: string; rate: number; label: string }> = ({ person, form, rate, label }) => {
  const text = `${person} ${form}`;
  const phase = useSpeechPhase(text);
  return (
    <button
      type="button"
      onClick={() => toggleSpeech(text, { rate })}
      aria-label={`${label}: ${text}`}
      className="group h-9 px-2 rounded-md hover:bg-ink-100 cursor-pointer flex items-center gap-2 text-sm text-left min-w-0"
    >
      <span className="text-ink-500 shrink-0">{person}</span>
      <span className="font-serif text-ink-900 truncate flex-1">{form}</span>
      <SpeakIcon phase={phase} className="w-3.5 h-3.5 shrink-0 text-ink-400 group-hover:text-ink-700" />
    </button>
  );
};

const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="pt-5 border-t border-ink-200 space-y-2">
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="text-xs font-medium text-ink-500">{title}</h4>
      {aside}
    </div>
    {children}
  </section>
);

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  isOpen,
  onClose,
  wordData,
  isLoading,
  contextSentence,
  isSavedInVocab,
  onToggleVocab,
  onRetry,
  activeWord,
  errorMessage,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [speechSpeed, setSpeechSpeed] = useState<number>(0.85);

  if (!isOpen) return null;

  const closeButton = (
    <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className="-mr-2 -mt-1 shrink-0">
      <X className="w-5 h-5" />
    </Button>
  );

  return (
    <Sheet onClose={onClose} label={wordData?.word || activeWord || t('wordModal.analyzing')}>
      <div className="flex-1 min-h-0 flex flex-col">
        {isLoading ? (
          <div className="p-6">
            <div className="flex justify-end">{closeButton}</div>
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 text-ink-500 animate-spin mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-ink-600">{t('wordModal.analyzing')}</p>
            </div>
          </div>
        ) : !wordData ? (
          <div className="p-6 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-2xl font-semibold text-ink-900 break-words">{activeWord || t('common.error')}</h2>
              {closeButton}
            </div>
            <p className="text-sm text-ink-600">{t('wordModal.failed')}</p>
            {errorMessage && <p role="alert" className="text-sm text-bad-700 break-words">{errorMessage}</p>}
            {onRetry && <Button onClick={onRetry}>{t('common.retry')}</Button>}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-6 space-y-5">
              {/* Entry head: word, sound, meaning */}
              <header className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-serif text-3xl font-semibold text-ink-900 break-words">{wordData.word}</h2>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-500">
                      <span className="font-mono text-base text-ink-700">{wordData.ipa || `[${wordData.word}]`}</span>
                      {wordData.partOfSpeech && <span>{wordData.partOfSpeech}</span>}
                      {wordData.cefrLevel && <span className="rounded-md border border-ink-300 px-1.5 text-xs leading-5">{wordData.cefrLevel}</span>}
                      {wordData.lemma && wordData.lemma.toLowerCase() !== wordData.word.toLowerCase() && (
                        <span>
                          {t('wordModal.lemma')} <span className="font-serif text-ink-800">{wordData.lemma}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  {closeButton}
                </div>

                <div className="flex items-center gap-2">
                  <SpeakButton text={wordData.word} rate={speechSpeed} label={t('wordModal.listen')} stopLabel={t('reader.stop')} variant="outline" showLabel />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSpeechSpeed(speechSpeed === 0.75 ? 1.0 : 0.75)}
                    aria-label={`${t('reader.tempo')} ${speechSpeed}×`}
                    title={t('reader.tempo')}
                    className="tnum"
                  >
                    {speechSpeed}×
                  </Button>
                </div>

                <div>
                  <p className="text-lg font-medium text-ink-900 break-words">{isEn && wordData.translationEn ? wordData.translationEn : wordData.translation}</p>
                  {wordData.otherMeanings && wordData.otherMeanings.length > 0 && (
                    <p className="text-sm text-ink-600 mt-0.5 break-words">
                      {t('wordModal.otherMeanings')} {wordData.otherMeanings.join(t('common.listSeparator'))}
                    </p>
                  )}
                </div>
              </header>

              {wordData.phoneticsGuide && (
                <Section title={t('wordModal.phoneticsGuide')}>
                  <p className="text-sm text-ink-800 leading-relaxed break-words">{wordData.phoneticsGuide}</p>
                </Section>
              )}

              {wordData.contextTense && (
                <Section title={t('wordModal.contextTense')}>
                  <p className="text-sm text-ink-800 leading-relaxed break-words">{wordData.contextTense}</p>
                  {contextSentence && (
                    <p className="font-serif text-base italic text-ink-600 break-words">
                      <span className="not-italic font-sans text-xs text-ink-500 mr-1.5">{t('wordModal.originalSentence')}</span>« {contextSentence} »
                    </p>
                  )}
                </Section>
              )}

              {wordData.conjugationTable && wordData.conjugationTable.length > 0 && (
                <Section title={t('wordModal.conjugation')} aside={<span className="text-xs text-ink-500">{t('wordModal.clickToListen')}</span>}>
                  <div className="space-y-3">
                    {wordData.conjugationTable.map((tenseBlock, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-medium text-ink-800 mb-1">{tenseBlock.tense}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2">
                          {tenseBlock.forms.map((item, fIdx) => (
                            <FormTile key={fIdx} person={item.person} form={item.form} rate={speechSpeed} label={t('wordModal.clickToListen')} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {wordData.usageExamples && wordData.usageExamples.length > 0 && (
                <Section title={t('wordModal.examples')}>
                  <ul className="divide-y divide-ink-200">
                    {wordData.usageExamples.map((ex, idx) => (
                      <li key={idx} className="py-2.5 first:pt-0 flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-serif text-base text-ink-900 leading-snug break-words">{ex.fr}</p>
                          <p className="text-sm text-ink-600 break-words">{isEn && ex.en ? ex.en : ex.zh}</p>
                        </div>
                        <SpeakButton
                          text={ex.fr}
                          rate={speechSpeed}
                          label={t('wordModal.listenExample')}
                          stopLabel={t('reader.stop')}
                          variant="ghost"
                          size="iconSm"
                          className="shrink-0 -mt-1"
                        />
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {wordData.memoryTrick && (
                <Section title={t('wordModal.memoryTrick')}>
                  <p className="text-sm text-ink-800 leading-relaxed break-words">{wordData.memoryTrick}</p>
                </Section>
              )}
            </div>

            <div className="px-4 py-3 border-t border-ink-200 bg-surface flex items-center justify-between gap-3">
              <Button
                variant={isSavedInVocab ? 'outline' : 'default'}
                onClick={() => onToggleVocab(wordData, contextSentence)}
                aria-pressed={isSavedInVocab}
                title={isSavedInVocab ? t('wordModal.removeHint') : undefined}
              >
                {isSavedInVocab ? <BookmarkCheck className="w-4 h-4 text-ok-800" aria-hidden="true" /> : <Bookmark className="w-4 h-4" aria-hidden="true" />}
                <span>{isSavedInVocab ? t('wordModal.removeFromVocab') : t('wordModal.addToVocab')}</span>
              </Button>
              <Button variant="ghost" onClick={onClose}>
                {t('common.close')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
