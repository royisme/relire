import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, OverlayHeader } from './ui/overlay';
import { Loader2 } from 'lucide-react';
import { SentenceAnalysis, PronunciationAssessment } from '../types';
import { stopSpeech, setGlobalRate } from '../utils/speech';
import { SpeakButton } from './ui/speak-button';
import { Button } from './ui/button';
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
              <Loader2 className="w-6 h-6 text-ink-500 animate-spin mx-auto mb-3" aria-hidden="true" />
              <p className="text-sm text-ink-600">{t('sentenceDrawer.analyzing')}</p>
            </div>
          ) : !sentenceData ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-sm text-ink-600">{t('common.error')}</p>
              {errorMessage && <p role="alert" className="text-sm text-bad-700 break-words">{errorMessage}</p>}
            </div>
          ) : (
            <>
              {/* The sentence, its translation, and listening at a chosen speed */}
              <section className="space-y-4">
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
                      variant="outline"
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
                              ? 'bg-accent-700 text-on-fill font-medium'
                              : 'border border-ink-200 bg-surface text-ink-700 hover:bg-ink-100'
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
              <section className="pt-6 border-t border-ink-200 space-y-5" aria-labelledby="shadowing-title">
                <h4 id="shadowing-title" className="font-serif font-semibold text-lg text-ink-900">
                  {t('shadowing.title')}
                </h4>
                {sentenceData.shadowingGuide && <ShadowingGuide guide={sentenceData.shadowingGuide} />}
                <ShadowingRecorder referenceText={sentenceData.sentence} onAssessed={onRecordAssessmentComplete} />
              </section>

              {/* Structure: each segment with its role */}
              {sentenceData.syntaxStructure && sentenceData.syntaxStructure.length > 0 && (
                <section className="pt-6 border-t border-ink-200 space-y-2">
                  <h4 className="font-serif font-semibold text-lg text-ink-900">{t('sentenceDrawer.syntaxStructure')}</h4>
                  <dl className="divide-y divide-ink-200 border-y border-ink-200">
                    {sentenceData.syntaxStructure.map((syn, idx) => (
                      <div key={idx} className="py-3 space-y-1">
                        <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-serif text-base text-ink-900 break-words">{syn.segment}</span>
                          <span className="text-xs text-ink-500">{syn.role}</span>
                        </dt>
                        <dd className="text-sm text-ink-700 leading-relaxed break-words">{syn.explanation}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* Grammar points */}
              {sentenceData.grammarPoints && sentenceData.grammarPoints.length > 0 && (
                <section className="pt-6 border-t border-ink-200 space-y-2">
                  <h4 className="font-serif font-semibold text-lg text-ink-900">{t('sentenceDrawer.grammarPoints')}</h4>
                  <ol className="space-y-4">
                    {sentenceData.grammarPoints.map((gp, idx) => (
                      <li key={idx} className="space-y-1">
                        <p className="text-sm font-medium text-ink-900 break-words">
                          <span className="tnum text-ink-500 mr-1.5">{idx + 1}.</span>
                          {gp.title}
                        </p>
                        <p className="text-sm text-ink-700 leading-relaxed break-words">{gp.explanation}</p>
                        {gp.ruleFormula && (
                          <p className="text-sm text-ink-700 break-words">
                            <span className="text-xs text-ink-500 mr-1.5">{t('sentenceDrawer.ruleFormula')}</span>
                            <span className="font-mono text-xs text-ink-900 bg-ink-100 rounded-md px-1.5 py-0.5">{gp.ruleFormula}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Patterns to reuse, with examples */}
              {sentenceData.patternCollocations && sentenceData.patternCollocations.length > 0 && (
                <section className="pt-6 border-t border-ink-200 space-y-2">
                  <h4 className="font-serif font-semibold text-lg text-ink-900">{t('sentenceDrawer.patterns')}</h4>
                  <div className="space-y-4">
                    {sentenceData.patternCollocations.map((pat, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-serif text-base font-semibold text-ink-900 break-words">{pat.pattern}</span>
                          <span className="text-sm text-ink-500 break-words">{pat.meaning}</span>
                        </p>
                        {pat.examples && (
                          <ul className="border-l-2 border-ink-200 pl-3 space-y-2">
                            {pat.examples.map((ex, exIdx) => (
                              <li key={exIdx} className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-serif text-base text-ink-900 break-words">{ex.fr}</p>
                                  <p className="text-sm text-ink-600 break-words">{isEn && ex.en ? ex.en : ex.zh}</p>
                                </div>
                                <SpeakButton
                                  text={ex.fr}
                                  rate={speechRate}
                                  label={t('reader.playSentence')}
                                  stopLabel={t('reader.stop')}
                                  variant="ghost"
                                  size="iconSm"
                                  className="shrink-0 -mt-1"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-surface border-t border-ink-200 flex items-center justify-end">
          <Button
            variant="outline"
            onClick={() => {
              stopSpeech();
              onClose();
            }}
          >
            {t('sentenceDrawer.done')}
          </Button>
        </div>
    </Sheet>
  );
};
