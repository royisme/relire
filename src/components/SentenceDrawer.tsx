import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, OverlayHeader } from './ui/overlay';
import { Mic, Sparkles, BookOpen, Loader2 } from 'lucide-react';
import { SentenceAnalysis, PronunciationAssessment } from '../types';
import { stopSpeech, setGlobalRate } from '../utils/speech';
import { SpeakButton } from './ui/speak-button';
import { ShadowingGuide } from './shadowing/ShadowingGuide';
import { ShadowingRecorder } from './shadowing/ShadowingRecorder';

interface SentenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sentence: string;
  sentenceData: SentenceAnalysis | null;
  isLoading: boolean;
  errorMessage?: string | null;
  onRecordAssessmentComplete?: (assessment: PronunciationAssessment, sentence: string) => void;
}

export const SentenceDrawer: React.FC<SentenceDrawerProps> = ({
  isOpen,
  onClose,
  sentence,
  sentenceData,
  isLoading,
  errorMessage,
  onRecordAssessmentComplete,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [speechRate, setSpeechRate] = useState<number>(0.85);
  const changeRate = (rate: number) => {
    setSpeechRate(rate);
    setGlobalRate(rate);
  };

  if (!isOpen) return null;

  return (
    <Sheet onClose={() => { stopSpeech(); onClose(); }} label={t('sentenceDrawer.title')} className="md:max-w-2xl">
        <OverlayHeader title={t('sentenceDrawer.title')} subtitle={t('sentenceDrawer.sub')} onClose={() => { stopSpeech(); onClose(); }} closeLabel={t('common.close')} />

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-10 h-10 text-accent-700 animate-spin mx-auto mb-3" />
              <h4 className="font-serif font-semibold text-lg text-ink-800">
                {t('sentenceDrawer.analyzing')}
              </h4>
            </div>
          ) : !sentenceData ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-ink-500">{t('common.error')}</p>
              {errorMessage && <p className="text-xs text-bad-700 break-words">{errorMessage}</p>}
            </div>
          ) : (
            <>
              {/* The sentence, its translation, and listening at a chosen speed */}
              <section className="p-5 rounded-lg bg-white border border-ink-200 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-ink-500">{t('sentenceDrawer.original')}</p>
                  <p className="font-serif text-xl sm:text-2xl font-semibold text-ink-900 leading-relaxed break-words">
                    « {sentenceData.sentence} »
                  </p>
                </div>
                <p className="text-sm text-ink-700 break-words">
                  <span className="text-xs text-ink-500 mr-1.5">{t('sentenceDrawer.translation')}:</span>
                  {sentenceData.translation}
                </p>

                <div className="pt-4 border-t border-ink-100 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <SpeakButton
                      text={sentenceData.sentence}
                      rate={speechRate}
                      label={t('sentenceDrawer.listenAudio')}
                      stopLabel={t('reader.stop')}
                      showLabel
                    />
                    <p className="text-sm text-ink-600">
                      {t('reader.tempo')} <span className="font-medium text-ink-900 tnum">{speechRate.toFixed(2)}×</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-500 tnum">0.5×</span>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={speechRate}
                      onChange={(e) => changeRate(parseFloat(e.target.value))}
                      aria-label={t('reader.tempo')}
                      className="flex-1 min-w-0 h-2 cursor-pointer accent-accent-700"
                    />
                    <span className="text-xs text-ink-500 tnum">1.5×</span>
                  </div>

                  {/* Five equal columns, so the presets fit any width instead of overflowing */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => {
                      const active = Math.abs(speechRate - rate) < 0.01;
                      return (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => changeRate(rate)}
                          aria-pressed={active}
                          className={`h-9 min-w-0 rounded-md text-xs tnum cursor-pointer ${
                            active
                              ? 'bg-accent-700 text-white font-medium'
                              : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
                          }`}
                        >
                          {rate}×
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Shadowing: how to say it, then record and check */}
              <section className="p-5 rounded-lg bg-white border border-ink-200 space-y-5" aria-labelledby="shadowing-title">
                <h4 id="shadowing-title" className="font-serif font-semibold text-base text-ink-900 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-ink-600" aria-hidden="true" />
                  <span>{t('shadowing.title')}</span>
                </h4>
                {sentenceData.shadowingGuide && <ShadowingGuide guide={sentenceData.shadowingGuide} />}
                <ShadowingRecorder referenceText={sentenceData.sentence} onAssessed={onRecordAssessmentComplete} />
              </section>

              {/* Syntactic Decomposition */}
              {sentenceData.syntaxStructure && sentenceData.syntaxStructure.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-serif font-semibold text-base text-ink-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-ink-600" />
                    <span>{t('sentenceDrawer.syntaxStructure')}</span>
                  </h4>
                  <div className="space-y-2">
                    {sentenceData.syntaxStructure.map((syn, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-lg bg-white border border-ink-200 space-y-1 hover:border-accent-300 transition-colors "
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1.5">
                          <span className="font-serif text-base font-semibold text-ink-900">
                            {syn.segment}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-accent-100 text-accent-900 border border-accent-200">
                            {syn.role}
                          </span>
                        </div>
                        <p className="text-xs text-ink-600 leading-relaxed font-sans">
                          {syn.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grammar Points & Rules */}
              {sentenceData.grammarPoints && sentenceData.grammarPoints.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-serif font-semibold text-base text-ink-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-ink-600" />
                    <span>{t('sentenceDrawer.grammarPoints')}</span>
                  </h4>
                  <div className="space-y-2.5">
                    {sentenceData.grammarPoints.map((gp, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-accent-50/50 border border-accent-200/80 space-y-2"
                      >
                        <div className="font-semibold text-xs text-accent-950 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-accent-200 text-accent-900 flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          <span>{gp.title}</span>
                        </div>
                        <p className="text-xs text-ink-700 leading-relaxed">
                          {gp.explanation}
                        </p>
                        {gp.ruleFormula && (
                          <div className="p-2 rounded-md bg-white border border-accent-200/60 font-mono text-xs text-accent-900">
                            {t('sentenceDrawer.ruleFormula')} {gp.ruleFormula}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pattern Collocations & Combination Examples */}
              {sentenceData.patternCollocations && sentenceData.patternCollocations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-serif font-semibold text-base text-ink-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-ink-600" />
                    <span>{t('sentenceDrawer.patterns')}</span>
                  </h4>
                  <div className="space-y-3">
                    {sentenceData.patternCollocations.map((pat, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-white border border-ink-200 space-y-2.5 "
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-ink-100">
                          <span className="font-mono text-xs font-semibold text-ok-800 bg-ok-50 px-2 py-0.5 rounded-md border border-ok-200">
                            {pat.pattern}
                          </span>
                          <span className="text-xs text-ink-500">{pat.meaning}</span>
                        </div>
                        {pat.examples && (
                          <div className="space-y-2">
                            {pat.examples.map((ex, exIdx) => (
                              <div
                                key={exIdx}
                                className="p-2.5 rounded-md bg-ink-50 text-xs space-y-0.5 group hover:bg-accent-50/50 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-serif text-sm font-semibold text-ink-900">
                                    {ex.fr}
                                  </span>
                                  <SpeakButton
                                    text={ex.fr}
                                    rate={speechRate}
                                    label={t('reader.playSentence')}
                                    stopLabel={t('reader.stop')}
                                    variant="ghost"
                                    size="iconSm"
                                    className="h-7 w-7 shrink-0 text-ink-500 hover:text-accent-800"
                                  />
                                </div>
                                <div className="text-ink-600 font-sans">
                                  {(isEn && ex.en) ? ex.en : ex.zh}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-ink-100 border-t border-ink-200 flex items-center justify-end">
          <button
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="h-10 px-4 text-sm font-medium rounded-md bg-accent-700 text-white hover:bg-accent-800 cursor-pointer"
          >
            {t('sentenceDrawer.done')}
          </button>
        </div>
    </Sheet>
  );
};
