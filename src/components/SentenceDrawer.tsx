import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  onRecordAssessmentComplete?: (assessment: PronunciationAssessment, sentence: string) => void;
}

export const SentenceDrawer: React.FC<SentenceDrawerProps> = ({
  isOpen,
  onClose,
  sentence,
  sentenceData,
  isLoading,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex justify-end">
      <div className="bg-[#FAF8F5] w-full max-w-2xl h-full min-h-screen shadow-2xl flex flex-col border-l border-amber-950/20 animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="p-5 bg-[#F4EFEA] border-b border-amber-900/10 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-700/15 text-amber-900 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-french-serif text-lg font-bold text-stone-900">
                  {t('sentenceDrawer.title')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-950 border border-amber-300/80">
                  {t('sentenceDrawer.badge')}
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                {t('sentenceDrawer.sub')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-10 h-10 text-amber-700 animate-spin mx-auto mb-3" />
              <h4 className="font-french-serif font-bold text-lg text-stone-800">
                {t('sentenceDrawer.analyzing')}
              </h4>
            </div>
          ) : !sentenceData ? (
            <div className="text-center py-12 text-stone-500">
              {t('common.error')}
            </div>
          ) : (
            <>
              {/* Sentence Showcase & Audio */}
              <div className="p-5 rounded-2xl bg-white border border-amber-900/15 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-sm">
                      Original Français
                    </span>
                    <p className="font-french-serif text-xl sm:text-2xl font-bold text-stone-900 leading-relaxed">
                      « {sentenceData.sentence} »
                    </p>
                  </div>
                </div>

                {/* Playback & Speed Control Section */}
                <div className="pt-3 border-t border-stone-100 space-y-3">
                  <div className="text-sm font-medium text-stone-700">
                    <span className="text-stone-400 text-xs mr-1.5">{t('sentenceDrawer.translation')}:</span>
                    {sentenceData.translation}
                  </div>

                  {/* Playback & Speed Slider Controller */}
                  <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayNative(sentenceData.sentence)}
                          disabled={isPlayingNative}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-75 text-white text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          <Volume2 className={`w-4 h-4 ${isPlayingNative ? 'animate-bounce text-amber-200' : ''}`} />
                          <span>{isPlayingNative ? t('common.loading') : t('sentenceDrawer.listenAudio')}</span>
                        </button>

                        {isPlayingNative && (
                          <button
                            onClick={() => {
                              stopSpeech();
                              setIsPlayingNative(false);
                            }}
                            className="px-3 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold transition-all cursor-pointer"
                          >
                            {t('reader.stop')}
                          </button>
                        )}
                      </div>

                      {/* Speed Display Badge */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-xs font-semibold text-amber-950">
                        <span>{t('reader.tempo')}:</span>
                        <span className="font-mono text-amber-700 text-sm font-bold">{speechRate.toFixed(2)}x</span>
                      </div>
                    </div>

                    {/* Speed Slider with Range 0.5x to 1.5x */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono font-medium text-stone-500">0.5x 🐢</span>
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
                          className="flex-1 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700 focus:outline-none"
                        />
                        <span className="text-[11px] font-mono font-medium text-stone-500">🐇 1.5x</span>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                        <span className="text-stone-400">{t('reader.quickPresets')}</span>
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
                                  ? 'bg-amber-700 text-white font-bold shadow-2xs'
                                  : 'bg-white hover:bg-stone-200/70 border border-stone-200 text-stone-600'
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
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-stone-900 text-white shadow-md space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Mic className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-100">
                        {t('sentenceDrawer.shadowingCoach')}
                      </h4>
                      <p className="text-[11px] text-stone-400">
                        {t('sentenceDrawer.sub')}
                      </p>
                    </div>
                  </div>
                  {sentenceData.shadowingGuide?.speedTip && (
                    <span className="text-[10px] text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-800/40 hidden sm:inline">
                      {sentenceData.shadowingGuide.speedTip}
                    </span>
                  )}
                </div>

                {/* Shadowing rhythm & liaisons tips */}
                {sentenceData.shadowingGuide && (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1.5">
                    {sentenceData.shadowingGuide.rhythmGroups && sentenceData.shadowingGuide.rhythmGroups.length > 0 && (
                      <div className="text-stone-300">
                        <span className="text-amber-400 font-semibold">{t('sentenceDrawer.rhythmGroups')} </span>
                        <span className="font-mono text-stone-200">
                          {sentenceData.shadowingGuide.rhythmGroups.join(' // ')}
                        </span>
                      </div>
                    )}
                    {sentenceData.shadowingGuide.liaisons && sentenceData.shadowingGuide.liaisons.length > 0 && (
                      <div className="text-stone-300">
                        <span className="text-amber-400 font-semibold">{t('sentenceDrawer.liaisons')} </span>
                        <span>{sentenceData.shadowingGuide.liaisons.join('； ')}</span>
                      </div>
                    )}
                    {sentenceData.shadowingGuide.intonation && (
                      <div className="text-stone-300">
                        <span className="text-amber-400 font-semibold">{t('sentenceDrawer.intonation')} </span>
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
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      <Mic className="w-4 h-4 text-white animate-pulse" />
                      <span>{recordedAudioUrl ? t('sentenceDrawer.recordShadowing') : t('sentenceDrawer.recordShadowing')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopRecording}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-md transition-all active:scale-95 animate-bounce cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-stone-950" />
                      <span>{t('common.done')} ({recordingSeconds}s)</span>
                    </button>
                  )}

                  {recordedAudioUrl && !isRecording && (
                    <div className="flex items-center gap-2">
                      <audio controls src={recordedAudioUrl} className="h-8 max-w-[200px]" />
                      <button
                        onClick={handleAssessPronunciation}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{t('sentenceDrawer.listeningCoach')}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            <span>{t('sentenceDrawer.shadowingCoach')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Pronunciation Evaluation Results */}
                {assessment && (
                  <div className="p-4 rounded-xl bg-white/10 border border-white/15 space-y-3 mt-3 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-400" />
                        <span className="font-bold text-sm text-stone-100">
                          {t('sentenceDrawer.overallScore')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-2xl font-french-serif font-bold text-amber-400">
                          {assessment.overallScore}
                        </span>
                        <span className="text-xs text-stone-400">/ 100</span>
                      </div>
                    </div>

                    {/* Sub-scores */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                        <div className="text-[10px] text-stone-400">{t('sentenceDrawer.accuracy')}</div>
                        <div className="text-sm font-bold text-emerald-400">
                          {assessment.accuracyScore}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                        <div className="text-[10px] text-stone-400">{t('sentenceDrawer.fluency')}</div>
                        <div className="text-sm font-bold text-blue-400">
                          {assessment.fluencyScore}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                        <div className="text-[10px] text-stone-400">{t('sentenceDrawer.rhythm')}</div>
                        <div className="text-sm font-bold text-purple-400">
                          {assessment.rhythmScore}
                        </div>
                      </div>
                    </div>

                    {/* Phoneme Feedback */}
                    {assessment.phonemeFeedback && assessment.phonemeFeedback.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-xs font-semibold text-amber-300">
                          {t('sentenceDrawer.coachFeedback')}:
                        </span>
                        <div className="space-y-1">
                          {assessment.phonemeFeedback.map((item, pIdx) => (
                            <div
                              key={pIdx}
                              className={`p-2 rounded-lg text-xs flex items-start gap-2 ${
                                item.status === 'excellent'
                                  ? 'bg-emerald-950/50 border border-emerald-800/40 text-emerald-200'
                                  : item.status === 'acceptable'
                                  ? 'bg-blue-950/50 border border-blue-800/40 text-blue-200'
                                  : 'bg-rose-950/50 border border-rose-800/40 text-rose-200'
                              }`}
                            >
                              <span className="font-mono font-bold px-1.5 py-0.5 rounded-sm bg-black/40 text-amber-300">
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
                        <span className="text-xs font-semibold text-amber-300">
                          {t('sentenceDrawer.coachFeedback')}:
                        </span>
                        {assessment.corrections.map((corr, cIdx) => (
                          <div key={cIdx} className="p-2 rounded-lg bg-white/5 text-xs text-stone-300 space-y-0.5">
                            <div className="font-semibold text-amber-200">
                              « {corr.word} » {corr.expectedIPA}
                            </div>
                            <div className="text-stone-400 text-[11px]">{corr.advice}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Coach Notes */}
                    {assessment.coachingNotes && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 italic">
                        {assessment.coachingNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Syntactic Decomposition */}
              {sentenceData.syntaxStructure && sentenceData.syntaxStructure.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-french-serif font-bold text-base text-stone-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-700" />
                    <span>{t('sentenceDrawer.syntaxStructure')}</span>
                  </h4>
                  <div className="space-y-2">
                    {sentenceData.syntaxStructure.map((syn, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1 hover:border-amber-300 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1.5">
                          <span className="font-french-serif text-base font-bold text-stone-900">
                            {syn.segment}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                            {syn.role}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 leading-relaxed font-french-sans">
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
                  <h4 className="font-french-serif font-bold text-base text-stone-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    <span>{t('sentenceDrawer.grammarPoints')}</span>
                  </h4>
                  <div className="space-y-2.5">
                    {sentenceData.grammarPoints.map((gp, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2"
                      >
                        <div className="font-bold text-xs text-blue-950 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-900 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span>{gp.title}</span>
                        </div>
                        <p className="text-xs text-stone-700 leading-relaxed">
                          {gp.explanation}
                        </p>
                        {gp.ruleFormula && (
                          <div className="p-2 rounded-lg bg-white border border-blue-200/60 font-mono text-[11px] text-blue-900">
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
                  <h4 className="font-french-serif font-bold text-base text-stone-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    <span>{t('sentenceDrawer.patterns')}</span>
                  </h4>
                  <div className="space-y-3">
                    {sentenceData.patternCollocations.map((pat, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-white border border-stone-200 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-stone-100">
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {pat.pattern}
                          </span>
                          <span className="text-xs text-stone-500">{pat.meaning}</span>
                        </div>
                        {pat.examples && (
                          <div className="space-y-2">
                            {pat.examples.map((ex, exIdx) => (
                              <div
                                key={exIdx}
                                className="p-2.5 rounded-lg bg-stone-50 text-xs space-y-0.5 group hover:bg-amber-50/50 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-french-serif text-sm font-semibold text-stone-900">
                                    {ex.fr}
                                  </span>
                                  <button
                                    onClick={() => handlePlayNative(ex.fr)}
                                    className="p-1 rounded-md text-stone-400 hover:text-amber-800 cursor-pointer"
                                    title={t('reader.playSentence')}
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="text-stone-600 font-french-sans">
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
        <div className="p-4 bg-[#F4EFEA] border-t border-amber-900/10 flex items-center justify-end">
          <button
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 cursor-pointer"
          >
            {t('sentenceDrawer.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
