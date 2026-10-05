import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from './ui/overlay';
import { X, Volume2, Bookmark, BookmarkCheck, Sparkles, BookOpen, Layers, Check, Loader2 } from 'lucide-react';
import { WordAnalysis, VocabWord } from '../types';
import { speakFrench } from '../utils/frenchSpeech';

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
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSpeak = (textToSpeak: string) => {
    setIsSpeaking(true);
    speakFrench(textToSpeak, {
      rate: speechSpeed,
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  return (
    <Sheet onClose={onClose} label={wordData?.word || activeWord || t('wordModal.analyzing')}>
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Loading state */}
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-9 h-9 text-accent-700 animate-spin mx-auto mb-3" />
            <h4 className="font-serif font-semibold text-lg text-ink-800">
              {t('wordModal.analyzing')}
            </h4>
          </div>
        ) : !wordData ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="font-serif font-semibold text-lg text-ink-800">
              {activeWord ? `« ${activeWord} »` : t('common.error')}
            </h4>
            <p className="text-xs text-ink-500 max-w-xs mx-auto">
              {t('wordModal.failed')}
            </p>
            {errorMessage && (
              <p className="text-xs text-bad-700 max-w-sm mx-auto break-words">{errorMessage}</p>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="h-10 px-4 bg-accent-700 hover:bg-accent-800 text-white rounded-md text-sm font-medium "
                >
                  {t('common.retry')}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-ink-200 text-ink-700 rounded-lg text-xs font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (

          <div className="flex-1 min-h-0 flex flex-col">
            {/* Header */}
            <div className="p-6 bg-ink-100 border-b border-ink-200">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-serif text-3xl font-semibold text-ink-900 tracking-tight">
                      {wordData.word}
                    </h2>
                    {wordData.lemma && wordData.lemma.toLowerCase() !== wordData.word.toLowerCase() && (
                      <span className="text-xs text-ink-500 font-sans">
                        ({t('wordModal.lemma')}: <span className="font-medium text-accent-900">{wordData.lemma}</span>)
                      </span>
                    )}
                    {wordData.cefrLevel && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent-200 text-accent-950">
                        {wordData.cefrLevel}
                      </span>
                    )}
                    {wordData.partOfSpeech && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-ink-200 text-ink-800">
                        {wordData.partOfSpeech}
                      </span>
                    )}
                  </div>

                  {/* Phonetics & IPA */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="font-mono text-base font-semibold text-accent-900 bg-white/70 px-2.5 py-0.5 rounded-md border border-ink-200">
                      {wordData.ipa || `[${wordData.word}]`}
                    </span>
                    <button
                      onClick={() => handleSpeak(wordData.word)}
                      disabled={isSpeaking}
                      className="flex items-center gap-1.5 h-10 px-4 bg-accent-700 hover:bg-accent-800 disabled:opacity-75 text-white rounded-md text-sm font-medium active:scale-95 transition-all"
                      title={t('wordModal.clickToListen')}
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'text-accent-200' : ''}`} />
                      <span>{isSpeaking ? t('common.loading') : 'TTS'}</span>
                    </button>
                    {/* Speed toggle */}
                    <div className="flex items-center gap-1 text-xs text-ink-500 bg-white/50 px-2 py-0.5 rounded-md">
                      <span>{t('reader.tempo')}:</span>
                      <button
                        onClick={() => setSpeechSpeed(speechSpeed === 0.75 ? 1.0 : 0.75)}
                        className="font-mono font-medium hover:text-accent-800 underline decoration-dotted"
                      >
                        {speechSpeed}x
                      </button>
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-200/60"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Translation in this context */}
              <div className="mt-4 pt-3 border-t border-ink-200">
                <div className="text-base font-semibold text-ink-900">
                  {(isEn && wordData.translationEn) ? wordData.translationEn : wordData.translation}
                </div>
                {wordData.otherMeanings && wordData.otherMeanings.length > 0 && (
                  <div className="text-xs text-ink-600 mt-0.5">
                    {t('wordModal.otherMeanings')} {wordData.otherMeanings.join('； ')}
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable details body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              
              {/* Phonetics & Sound breakdown */}
              {wordData.phoneticsGuide && (
                <div className="p-3.5 rounded-lg bg-accent-50 border border-accent-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-900 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-ink-600" />
                    <span>{t('wordModal.phoneticsGuide')}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-accent-950 font-sans">
                    {wordData.phoneticsGuide}
                  </p>
                </div>
              )}

              {/* Context Tense & Morphology Analysis */}
              {wordData.contextTense && (
                <div className="p-4 rounded-lg bg-accent-50/70 border border-accent-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-900 mb-1">
                    <Layers className="w-3.5 h-3.5 text-ink-600" />
                    <span>{t('wordModal.contextTense')}</span>
                  </div>
                  <p className="text-xs font-medium text-accent-950 mb-2 leading-relaxed">
                    {wordData.contextTense}
                  </p>
                  {contextSentence && (
                    <div className="text-xs p-2 bg-white/80 rounded-md text-ink-600 border border-accent-100 italic font-serif">
                      {t('wordModal.originalSentence')} “{contextSentence}”
                    </div>
                  )}
                </div>
              )}

              {/* Conjugation Matrix (if verb) */}
              {wordData.conjugationTable && wordData.conjugationTable.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-ink-800 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-ink-600" />
                      <span>{t('wordModal.conjugation')}</span>
                    </h4>
                    <span className="text-xs text-ink-400">{t('wordModal.clickToListen')}</span>
                  </div>

                  <div className="space-y-2.5">
                    {wordData.conjugationTable.map((tenseBlock, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-ink-200 bg-white p-3 "
                      >
                        <div className="text-xs font-semibold text-accent-950 pb-1.5 border-b border-ink-100 flex items-center justify-between">
                          <span>{tenseBlock.tense}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {tenseBlock.forms.map((item, fIdx) => (
                            <div
                              key={fIdx}
                              onClick={() => handleSpeak(`${item.person} ${item.form}`)}
                              className="p-1.5 rounded-md bg-ink-50 hover:bg-accent-50 cursor-pointer flex items-center justify-between text-xs transition-colors group"
                            >
                              <span className="text-ink-400 text-xs">{item.person}</span>
                              <span className="font-semibold text-ink-800 group-hover:text-accent-900">
                                {item.form}
                              </span>
                              <Volume2 className="w-3 h-3 text-ink-300 group-hover:text-ink-600" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Usage Examples in Diverse Contexts */}
              {wordData.usageExamples && wordData.usageExamples.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-ink-800 mb-2">
                    {t('wordModal.examples')}
                  </h4>
                  <div className="space-y-2">
                    {wordData.usageExamples.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-white border border-ink-200 text-xs space-y-1 hover:border-accent-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-serif text-sm font-semibold text-ink-900 leading-snug">
                            {ex.fr}
                          </p>
                          <button
                            onClick={() => handleSpeak(ex.fr)}
                            className="p-1 rounded-md text-ink-400 hover:text-accent-800 hover:bg-accent-100/50"
                            title={t('wordModal.listenExample')}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-ink-600 font-sans text-xs">
                          {(isEn && ex.en) ? ex.en : ex.zh}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memory Trick / Etymology */}
              {wordData.memoryTrick && (
                <div className="p-3 rounded-lg bg-ink-100/80 border border-ink-200 text-xs">
                  <span className="font-semibold text-ink-800">{t('wordModal.memoryTrick')} </span>
                  <span className="text-ink-600">{wordData.memoryTrick}</span>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="p-4 bg-ink-50 border-t border-ink-200 flex items-center justify-between">
              <button
                onClick={() => onToggleVocab(wordData, contextSentence)}
                className={`flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium transition-all active:scale-95 ${
                  isSavedInVocab
                    ? 'bg-ok-700 text-white'
                    : 'bg-accent-700 hover:bg-accent-800 text-white'
                }`}
              >
                {isSavedInVocab ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-white" />
                    <span>{t('wordModal.removeFromVocab')}</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4 text-ink-600" />
                    <span>{t('wordModal.addToVocab')}</span>
                  </>
                )}
              </button>

              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-ink-600 hover:text-ink-900 rounded-md hover:bg-ink-200/50"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
