import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, OverlayHeader } from './ui/overlay';
import {
  X, Volume2, Mic, Square, Play, RotateCcw, Sparkles,
  BookOpen, CheckCircle2, AlertCircle, Award, ChevronRight, Loader2, Info
} from 'lucide-react';
import { SentenceAnalysis, PronunciationAssessment } from '../types';
import { speakFrench, stopSpeech, FrenchAudioRecorder, setGlobalRate } from '../utils/frenchSpeech';
import { assessPronunciation } from '../services/api';

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
  const { t } = useTranslation();
  const [speechRate, setSpeechRate] = useState<number>(0.85);
  const [isPlayingNative, setIsPlayingNative] = useState<boolean>(false);

  // Shadowing & Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string>('audio/webm');
  
  // AI Pronunciation Assessment state
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [userTranscript, setUserTranscript] = useState<string>('');

  const recorderRef = useRef<FrenchAudioRecorder | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    // Reset state on sentence change
    if (sentence) {
      setRecordedAudioUrl(null);
      setRecordedBase64(null);
      setAssessment(null);
      setUserTranscript('');
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  }, [sentence]);

  if (!isOpen) return null;

  const handlePlayNative = (textToPlay: string) => {
    setIsPlayingNative(true);
    speakFrench(textToPlay, {
      rate: speechRate,
      onEnd: () => setIsPlayingNative(false),
      onError: () => setIsPlayingNative(false),
    });
  };

  const handleStartRecording = async () => {
    stopSpeech();
    setIsPlayingNative(false);
    setAssessment(null);

    const recorder = new FrenchAudioRecorder();
    recorderRef.current = recorder;
    const ok = await recorder.start();
    if (!ok) {
      alert(t('sentenceDrawer.micError'));
      return;
    }

    setIsRecording(true);
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    // Optional: client-side SpeechRecognition to assist轉寫
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SpeechRec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const rec = new SpeechRec();
        rec.lang = 'fr-FR';
        rec.interimResults = false;
        rec.onresult = (evt: any) => {
          const transcript = evt.results[0][0].transcript;
          setUserTranscript(transcript);
        };
        rec.start();
      } catch (e) {
        // Ignore SpeechRec errors if unsupported
      }
    }
  };

  const handleStopRecording = async () => {
    if (!recorderRef.current || !isRecording) return;

    clearInterval(timerRef.current);
    setIsRecording(false);

    const result = await recorderRef.current.stop();
    if (result) {
      const url = URL.createObjectURL(result.blob);
      setRecordedAudioUrl(url);
      setRecordedBase64(result.base64);
      setRecordedMimeType(result.mimeType);
    }
  };

  const handleAssessPronunciation = async () => {
    if (!sentence) return;
    setIsEvaluating(true);

    try {
      const res = await assessPronunciation({
        referenceText: sentence,
        audioBase64: recordedBase64 || undefined,
        mimeType: recordedMimeType,
        userTranscript: userTranscript || undefined,
      });
      setAssessment(res);
      if (onRecordAssessmentComplete) {
        onRecordAssessmentComplete(res, sentence);
      }
    } catch (err: any) {
      console.error('Assessment failed:', err);
      alert(t('sentenceDrawer.assessmentError'));
    } finally {
      setIsEvaluating(false);
    }
  };

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
              {/* Sentence Showcase & Audio */}
              <div className="p-5 rounded-lg bg-white border border-ink-200 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <span className="text-xs font-semibold text-accent-800 bg-accent-100/80 px-2 py-0.5 rounded-sm">
                      Original Français
                    </span>
                    <p className="font-serif text-xl sm:text-2xl font-semibold text-ink-900 leading-relaxed">
                      « {sentenceData.sentence} »
                    </p>
                  </div>
                </div>

                {/* Playback & Speed Control Section */}
                <div className="pt-3 border-t border-ink-100 space-y-3">
                  <div className="text-sm font-medium text-ink-700">
                    <span className="text-ink-400 text-xs mr-1.5">{t('sentenceDrawer.translation')}:</span>
                    {sentenceData.translation}
                  </div>

                  {/* Playback & Speed Slider Controller */}
                  <div className="p-3.5 rounded-lg bg-ink-50 border border-ink-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayNative(sentenceData.sentence)}
                          disabled={isPlayingNative}
                          className="flex items-center gap-2 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 disabled:opacity-75 text-white text-sm font-medium transition-all active:scale-95 cursor-pointer"
                        >
                          <Volume2 className={`w-4 h-4 ${isPlayingNative ? 'text-accent-200' : ''}`} />
                          <span>{isPlayingNative ? t('common.loading') : t('sentenceDrawer.listenAudio')}</span>
                        </button>

                        {isPlayingNative && (
                          <button
                            onClick={() => {
                              stopSpeech();
                              setIsPlayingNative(false);
                            }}
                            className="px-3 py-2 rounded-lg bg-ink-200 hover:bg-ink-300 text-ink-700 text-xs font-semibold transition-all cursor-pointer"
                          >
                            {t('reader.stop')}
                          </button>
                        )}
                      </div>

                      {/* Speed Display Badge */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-ink-200 text-xs font-semibold text-accent-950">
                        <span>{t('reader.tempo')}:</span>
                        <span className="font-mono text-accent-700 text-sm font-semibold">{speechRate.toFixed(2)}x</span>
                      </div>
                    </div>

                    {/* Speed Slider with Range 0.5x to 1.5x */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-medium text-ink-500">0.5×</span>
                        <input
                          type="range"
                          min="0.5"
                          max="1.5"
                          step="0.05"
                          value={speechRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setSpeechRate(val);
                            setGlobalRate(val);
                          }}
                          className="flex-1 h-2 bg-ink-200 rounded-md appearance-none cursor-pointer accent-accent-700 focus:outline-none"
                        />
                        <span className="text-xs font-mono font-medium text-ink-500">1.5×</span>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center justify-between text-xs text-ink-500 pt-1">
                        <span className="text-ink-400">{t('reader.quickPresets')}</span>
                        <div className="flex items-center gap-1.5">
                          {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
                            <button
                              key={rate}
                              onClick={() => {
                                setSpeechRate(rate);
                                setGlobalRate(rate);
                              }}
                              className={`px-2 py-0.5 rounded-md font-mono transition-all ${
                                Math.abs(speechRate - rate) < 0.01
                                  ? 'bg-accent-700 text-white font-semibold '
                                  : 'bg-white hover:bg-ink-200/70 border border-ink-200 text-ink-600'
                              }`}
                            >
                              {rate.toFixed( rate === 1.0 || rate === 0.5 || rate === 1.5 ? 1 : 2 )}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shadowing & AI Pronunciation Coach Card */}
              <div className="p-5 rounded-lg bg-ink-50 text-ink-900 border border-ink-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-accent-100 text-accent-800 flex items-center justify-center">
                      <Mic className="w-4 h-4 text-ink-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-ink-900">
                        {t('sentenceDrawer.shadowingCoach')}
                      </h4>
                      <p className="text-xs text-ink-500">
                        {t('sentenceDrawer.sub')}
                      </p>
                    </div>
                  </div>
                  {sentenceData.shadowingGuide?.speedTip && (
                    <span className="text-xs text-accent-900 bg-accent-100 px-2 py-0.5 rounded-md hidden sm:inline">
                      {sentenceData.shadowingGuide.speedTip}
                    </span>
                  )}
                </div>

                {/* Shadowing rhythm & liaisons tips */}
                {sentenceData.shadowingGuide && (
                  <div className="p-3 rounded-lg bg-white border border-ink-200 text-xs space-y-1.5">
                    {sentenceData.shadowingGuide.rhythmGroups && sentenceData.shadowingGuide.rhythmGroups.length > 0 && (
                      <div className="text-ink-700">
                        <span className="text-accent-800 font-semibold">{t('sentenceDrawer.rhythmGroups')} </span>
                        <span className="font-mono text-ink-800">
                          {sentenceData.shadowingGuide.rhythmGroups.join(' // ')}
                        </span>
                      </div>
                    )}
                    {sentenceData.shadowingGuide.liaisons && sentenceData.shadowingGuide.liaisons.length > 0 && (
                      <div className="text-ink-700">
                        <span className="text-accent-800 font-semibold">{t('sentenceDrawer.liaisons')} </span>
                        <span>{sentenceData.shadowingGuide.liaisons.join('； ')}</span>
                      </div>
                    )}
                    {sentenceData.shadowingGuide.intonation && (
                      <div className="text-ink-700">
                        <span className="text-accent-800 font-semibold">{t('sentenceDrawer.intonation')} </span>
                        <span>{sentenceData.shadowingGuide.intonation}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Recorder Buttons */}
                <div className="flex items-center gap-3 flex-wrap">
                  {!isRecording ? (
                    <button
                      onClick={handleStartRecording}
                      className="flex items-center gap-2 h-10 px-4 rounded-md bg-bad-600 hover:bg-bad-700 text-ink-900 text-sm font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      <Mic className="w-4 h-4 text-ink-900 animate-pulse" />
                      <span>{recordedAudioUrl ? t('sentenceDrawer.recordShadowing') : t('sentenceDrawer.recordShadowing')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopRecording}
                      className="flex items-center gap-2 h-10 px-4 rounded-md bg-accent-500 hover:bg-accent-600 text-accent-950 text-sm font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-accent-950" />
                      <span>{t('common.done')} ({recordingSeconds}s)</span>
                    </button>
                  )}

                  {recordedAudioUrl && !isRecording && (
                    <div className="flex items-center gap-2">
                      <audio controls src={recordedAudioUrl} className="h-8 max-w-[200px]" />
                      <button
                        onClick={handleAssessPronunciation}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ok-600 hover:bg-ok-700 disabled:opacity-50 text-ink-900 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{t('sentenceDrawer.listeningCoach')}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-ink-600" />
                            <span>{t('sentenceDrawer.shadowingCoach')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Pronunciation Evaluation Results */}
                {assessment && (
                  <div className="p-4 rounded-lg bg-white border border-ink-200 space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-ink-600" />
                        <span className="font-semibold text-sm text-ink-900">
                          {t('sentenceDrawer.overallScore')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-2xl font-serif font-semibold text-accent-800">
                          {assessment.overallScore}
                        </span>
                        <span className="text-xs text-ink-500">/ 100</span>
                      </div>
                    </div>

                    {/* Sub-scores */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-md bg-white border border-ink-200">
                        <div className="text-xs text-ink-500">{t('sentenceDrawer.accuracy')}</div>
                        <div className="text-sm font-semibold text-ok-700">
                          {assessment.accuracyScore}
                        </div>
                      </div>
                      <div className="p-2 rounded-md bg-white border border-ink-200">
                        <div className="text-xs text-ink-500">{t('sentenceDrawer.fluency')}</div>
                        <div className="text-sm font-semibold text-accent-800">
                          {assessment.fluencyScore}
                        </div>
                      </div>
                      <div className="p-2 rounded-md bg-white border border-ink-200">
                        <div className="text-xs text-ink-500">{t('sentenceDrawer.rhythm')}</div>
                        <div className="text-sm font-semibold text-purple-400">
                          {assessment.rhythmScore}
                        </div>
                      </div>
                    </div>

                    {/* Phoneme Feedback */}
                    {assessment.phonemeFeedback && assessment.phonemeFeedback.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-xs font-semibold text-accent-800">
                          {t('sentenceDrawer.coachFeedback')}:
                        </span>
                        <div className="space-y-1">
                          {assessment.phonemeFeedback.map((item, pIdx) => (
                            <div
                              key={pIdx}
                              className={`p-2 rounded-md text-xs flex items-start gap-2 ${
                                item.status === 'excellent'
                                  ? 'bg-ok-50 border border-ok-200 text-ok-900'
                                  : item.status === 'acceptable'
                                  ? 'bg-accent-50 border border-accent-200 text-accent-900'
                                  : 'bg-bad-50 border border-bad-200 text-bad-900'
                              }`}
                            >
                              <span className="font-mono font-semibold px-1.5 py-0.5 rounded-sm bg-black/40 text-accent-800">
                                {item.phoneme}
                              </span>
                              <div className="flex-1">
                                <span className="font-semibold">{item.targetWord}: </span>
                                <span>{item.tip}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Corrections & Advice */}
                    {assessment.corrections && assessment.corrections.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-accent-800">
                          {t('sentenceDrawer.coachFeedback')}:
                        </span>
                        {assessment.corrections.map((corr, cIdx) => (
                          <div key={cIdx} className="p-2 rounded-md bg-white text-xs text-ink-700 space-y-0.5">
                            <div className="font-semibold text-accent-800">
                              « {corr.word} » {corr.expectedIPA}
                            </div>
                            <div className="text-ink-500 text-xs">{corr.advice}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Coach Notes */}
                    {assessment.coachingNotes && (
                      <div className="p-2.5 rounded-md bg-ink-50 border border-ink-200 text-xs text-ink-700 italic">
                        {assessment.coachingNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                                  <button
                                    onClick={() => handlePlayNative(ex.fr)}
                                    className="p-1 rounded-md text-ink-400 hover:text-accent-800 cursor-pointer"
                                    title={t('reader.playSentence')}
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-ink-600 font-sans">
                                  {ex.zh}
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
