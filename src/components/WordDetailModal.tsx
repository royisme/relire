import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#FAF8F5] border border-amber-950/20 rounded-xl max-w-xl w-full shadow-lg overflow-hidden transition-all my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Loading state */}
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-9 h-9 text-amber-700 animate-spin mx-auto mb-3" />
            <h4 className="font-french-serif font-bold text-lg text-stone-800">
              {t('wordModal.analyzing')}
            </h4>
          </div>
        ) : !wordData ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="font-french-serif font-bold text-lg text-stone-800">
              {activeWord ? `« ${activeWord} »` : t('common.error')}
            </h4>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              {t('wordModal.failed')}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  {t('common.retry')}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-stone-200 text-stone-700 rounded-xl text-xs font-medium"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (

          <div>
            {/* Header */}
            <div className="p-6 bg-[#F3EDE3] border-b border-amber-900/10">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-french-serif text-3xl font-bold text-stone-900 tracking-tight">
                      {wordData.word}
                    </h2>
                    {wordData.lemma && wordData.lemma.toLowerCase() !== wordData.word.toLowerCase() && (
                      <span className="text-xs text-stone-500 font-french-sans">
                        ({t('wordModal.lemma')}: <span className="font-medium text-amber-900">{wordData.lemma}</span>)
                      </span>
                    )}
                    {wordData.cefrLevel && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-950">
                        {wordData.cefrLevel}
                      </span>
                    )}
                    {wordData.partOfSpeech && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-200 text-stone-800">
                        {wordData.partOfSpeech}
                      </span>
                    )}
                  </div>

                  {/* Phonetics & IPA */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="font-mono text-base font-semibold text-amber-900 bg-white/70 px-2.5 py-0.5 rounded-md border border-amber-900/10">
                      {wordData.ipa || `[${wordData.word}]`}
                    </span>
                    <button
                      onClick={() => handleSpeak(wordData.word)}
                      disabled={isSpeaking}
                      className="flex items-center gap-1.5 px-3 py-1 bg-amber-700 hover:bg-amber-800 disabled:opacity-75 text-white rounded-lg text-xs font-semibold shadow-xs active:scale-95 transition-all"
                      title={t('wordModal.clickToListen')}
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'text-amber-200' : ''}`} />
                      <span>{isSpeaking ? t('common.loading') : 'TTS'}</span>
                    </button>
                    {/* Speed toggle */}
                    <div className="flex items-center gap-1 text-[11px] text-stone-500 bg-white/50 px-2 py-0.5 rounded-md">
                      <span>{t('reader.tempo')}:</span>
                      <button
                        onClick={() => setSpeechSpeed(speechSpeed === 0.75 ? 1.0 : 0.75)}
                        className="font-mono font-medium hover:text-amber-800 underline decoration-dotted"
                      >
                        {speechSpeed}x
                      </button>
                    </div>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Translation in this context */}
              <div className="mt-4 pt-3 border-t border-amber-900/10">
                <div className="text-base font-bold text-stone-900">
                  {(isEn && wordData.translationEn) ? wordData.translationEn : wordData.translation}
                </div>
                {wordData.otherMeanings && wordData.otherMeanings.length > 0 && (
                  <div className="text-xs text-stone-600 mt-0.5">
                    {t('wordModal.otherMeanings')} {wordData.otherMeanings.join('； ')}
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable details body */}
            <div className="p-6 space-y-5 max-h-[62vh] overflow-y-auto">
              
              {/* Phonetics & Sound breakdown */}
              {wordData.phoneticsGuide && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>{t('wordModal.phoneticsGuide')}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-950 font-french-sans">
                    {wordData.phoneticsGuide}
                  </p>
                </div>
              )}

              {/* Context Tense & Morphology Analysis */}
              {wordData.contextTense && (
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 mb-1">
                    <Layers className="w-3.5 h-3.5 text-blue-700" />
                    <span>{t('wordModal.contextTense')}</span>
                  </div>
                  <p className="text-xs font-medium text-blue-950 mb-2 leading-relaxed">
                    {wordData.contextTense}
                  </p>
                  {contextSentence && (
                    <div className="text-[11px] p-2 bg-white/80 rounded-md text-stone-600 border border-blue-100 italic font-french-serif">
                      {t('wordModal.originalSentence')} “{contextSentence}”
                    </div>
                  )}
                </div>
              )}

              {/* Conjugation Matrix (if verb) */}
              {wordData.conjugationTable && wordData.conjugationTable.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                      <span>{t('wordModal.conjugation')}</span>
                    </h4>
                    <span className="text-[10px] text-stone-400">{t('wordModal.clickToListen')}</span>
                  </div>

                  <div className="space-y-2.5">
                    {wordData.conjugationTable.map((tenseBlock, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs"
                      >
                        <div className="text-xs font-semibold text-amber-950 pb-1.5 border-b border-stone-100 flex items-center justify-between">
                          <span>{tenseBlock.tense}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                          {tenseBlock.forms.map((item, fIdx) => (
                            <div
                              key={fIdx}
                              onClick={() => handleSpeak(`${item.person} ${item.form}`)}
                              className="p-1.5 rounded-lg bg-stone-50 hover:bg-amber-50 cursor-pointer flex items-center justify-between text-xs transition-colors group"
                            >
                              <span className="text-stone-400 text-[11px]">{item.person}</span>
                              <span className="font-semibold text-stone-800 group-hover:text-amber-900">
                                {item.form}
                              </span>
                              <Volume2 className="w-3 h-3 text-stone-300 group-hover:text-amber-700" />
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
                  <h4 className="text-xs font-bold text-stone-800 mb-2">
                    {t('wordModal.examples')}
                  </h4>
                  <div className="space-y-2">
                    {wordData.usageExamples.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-white border border-stone-200 text-xs space-y-1 hover:border-amber-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-french-serif text-sm font-semibold text-stone-900 leading-snug">
                            {ex.fr}
                          </p>
                          <button
                            onClick={() => handleSpeak(ex.fr)}
                            className="p-1 rounded-md text-stone-400 hover:text-amber-800 hover:bg-amber-100/50"
                            title={t('wordModal.listenExample')}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-stone-600 font-french-sans text-xs">
                          {(isEn && ex.en) ? ex.en : ex.zh}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memory Trick / Etymology */}
              {wordData.memoryTrick && (
                <div className="p-3 rounded-xl bg-stone-100/80 border border-stone-200 text-xs">
                  <span className="font-semibold text-stone-800">{t('wordModal.memoryTrick')} </span>
                  <span className="text-stone-600">{wordData.memoryTrick}</span>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="p-4 bg-[#F5EFE6] border-t border-amber-900/10 flex items-center justify-between">
              <button
                onClick={() => onToggleVocab(wordData, contextSentence)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  isSavedInVocab
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-stone-900 hover:bg-stone-800 text-amber-300 shadow-sm'
                }`}
              >
                {isSavedInVocab ? (
                  <>
                    <BookmarkCheck className="w-4 h-4 text-emerald-200" />
                    <span>{t('wordModal.removeFromVocab')}</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-4 h-4 text-amber-400" />
                    <span>{t('wordModal.addToVocab')}</span>
                  </>
                )}
              </button>

              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-200/50"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
