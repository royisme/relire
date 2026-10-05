import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dumbbell, Sparkles, Mic, Volume2, CheckCircle2, XCircle, RotateCcw,
  ArrowRight, Square, Award, BookOpen, Layers, MessageSquare, Loader2
} from 'lucide-react';
import { Article, PracticeDeck, PracticeQuestion, PronunciationAssessment } from '../types';
import { generatePracticeDrills, assessPronunciation, MissingApiKeyError } from '../services/api';
import { speakFrench, stopSpeech, FrenchAudioRecorder } from '../utils/frenchSpeech';

interface PracticeViewProps {
  currentArticle: Article | null;
  onOpenLibrary: () => void;
  onNeedsKey: () => void;
  onRecordAssessmentComplete: (assessment: PronunciationAssessment, sentence: string) => void;
}

export const PracticeView: React.FC<PracticeViewProps> = ({
  currentArticle,
  onOpenLibrary,
  onNeedsKey,
  onRecordAssessmentComplete,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [activePracticeType, setActivePracticeType] = useState<'syntax' | 'oral' | 'cloze'>('syntax');
  const [isLoadingDeck, setIsLoadingDeck] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [deck, setDeck] = useState<PracticeDeck | null>(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  // Scramble mode state
  const [selectedChunks, setSelectedChunks] = useState<string[]>([]);
  const [scrambleStatus, setScrambleStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  // Cloze mode state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);

  // Oral Shadowing mode state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState('audio/webm');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [oralAssessment, setOralAssessment] = useState<PronunciationAssessment | null>(null);
  const [userTranscript, setUserTranscript] = useState('');

  const recorderRef = React.useRef<FrenchAudioRecorder | null>(null);
  const timerRef = React.useRef<any>(null);

  // Load drills on type or article change
  const handleLoadDrills = async (type: 'syntax' | 'oral' | 'cloze', fresh = false) => {
    setActivePracticeType(type);
    setIsLoadingDeck(true);
    setDeckError(null);
    setDeck(null);
    setActiveQuestionIdx(0);
    resetQuestionState();

    try {
      const result = await generatePracticeDrills(currentArticle!.content, type, fresh);
      setDeck(result);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        onNeedsKey();
      } else {
        setDeckError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsLoadingDeck(false);
    }
  };

  const resetQuestionState = () => {
    setSelectedChunks([]);
    setScrambleStatus('idle');
    setSelectedOption(null);
    setIsAnswerRevealed(false);
    setRecordedAudioUrl(null);
    setRecordedBase64(null);
    setOralAssessment(null);
    setUserTranscript('');
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const currentQ: PracticeQuestion | undefined = deck?.questions[activeQuestionIdx];

  const handleChunkClick = (chunk: string) => {
    if (selectedChunks.includes(chunk)) {
      setSelectedChunks(selectedChunks.filter((c) => c !== chunk));
    } else {
      setSelectedChunks([...selectedChunks, chunk]);
    }
  };

  const handleCheckScramble = () => {
    if (!currentQ) return;
    const userBuilt = selectedChunks.join(' ').replace(/\s+,/g, ',').trim();
    const target = currentQ.targetSentence.trim();

    // Check if matched
    if (
      userBuilt.toLowerCase().replace(/[^a-zà-ÿ]/g, '') ===
      target.toLowerCase().replace(/[^a-zà-ÿ]/g, '')
    ) {
      setScrambleStatus('correct');
    } else {
      setScrambleStatus('incorrect');
    }
  };

  const handleStartOralRecording = async () => {
    stopSpeech();
    setOralAssessment(null);

    const recorder = new FrenchAudioRecorder();
    recorderRef.current = recorder;
    const ok = await recorder.start();
    if (!ok) {
      alert(t('practice.micError'));
      return;
    }

    setIsRecording(true);
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SpeechRec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const rec = new SpeechRec();
        rec.lang = 'fr-FR';
        rec.onresult = (evt: any) => {
          setUserTranscript(evt.results[0][0].transcript);
        };
        rec.start();
      } catch (e) {}
    }
  };

  const handleStopOralRecording = async () => {
    if (!recorderRef.current || !isRecording) return;
    clearInterval(timerRef.current);
    setIsRecording(false);

    const result = await recorderRef.current.stop();
    if (result) {
      setRecordedAudioUrl(URL.createObjectURL(result.blob));
      setRecordedBase64(result.base64);
      setRecordedMimeType(result.mimeType);
    }
  };

  const handleAssessOral = async () => {
    if (!currentQ) return;
    setIsEvaluating(true);
    try {
      const res = await assessPronunciation({
        referenceText: currentQ.targetSentence,
        audioBase64: recordedBase64 || undefined,
        mimeType: recordedMimeType,
        userTranscript: userTranscript || undefined,
      });
      setOralAssessment(res);
      onRecordAssessmentComplete(res, currentQ.targetSentence);
    } catch (err) {
      console.error('Failed to assess oral:', err);
      alert(t('practice.assessError'));
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    if (deck && activeQuestionIdx + 1 < deck.questions.length) {
      setActiveQuestionIdx(activeQuestionIdx + 1);
      resetQuestionState();
    }
  };

  if (!currentArticle) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <p className="font-serif text-lg text-ink-900">{t('practice.noArticleTitle')}</p>
        <p className="text-sm text-ink-500">{t('practice.noArticleDesc')}</p>
        <button
          onClick={onOpenLibrary}
          className="h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium cursor-pointer"
        >
          {t('practice.openLibrary')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Header */}
      <div className="p-5 rounded-lg bg-white border border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-semibold text-2xl text-ink-900 flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-ink-600" />
            <span>{t('practice.title')}</span>
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            {t('practice.subtitle')} — 《{currentArticle.title}》
          </p>
        </div>

        {/* Practice Mode Selector Tabs */}
        <div className="flex items-center bg-ink-100 p-1 rounded-lg border border-ink-200 text-xs font-semibold">
          <button
            onClick={() => handleLoadDrills('syntax')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activePracticeType === 'syntax'
                ? 'bg-white text-ink-900 font-semibold'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-ink-600" />
            <span>{t('practice.tabSyntax')}</span>
          </button>

          <button
            onClick={() => handleLoadDrills('oral')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activePracticeType === 'oral'
                ? 'bg-white text-ink-900 font-semibold'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-ink-600" />
            <span>{t('practice.tabOral')}</span>
          </button>

          <button
            onClick={() => handleLoadDrills('cloze')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              activePracticeType === 'cloze'
                ? 'bg-white text-ink-900 font-semibold'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-ink-600" />
            <span>{t('practice.tabCloze')}</span>
          </button>
        </div>
      </div>

      {/* Loading Deck State */}
      {isLoadingDeck ? (
        <div className="py-20 text-center rounded-lg bg-white border border-ink-200">
          <Loader2 className="w-10 h-10 text-accent-700 animate-spin mx-auto mb-3" />
          <h3 className="font-serif font-semibold text-lg text-ink-800">
            {t('practice.generating')}
          </h3>
        </div>
      ) : !deck ? (
        <div className="p-12 text-center rounded-lg bg-white border border-ink-200 space-y-3">
          <Sparkles className="w-10 h-10 text-ink-600 mx-auto" />
          <h3 className="font-serif font-semibold text-xl text-ink-900">
            {t('practice.title')}
          </h3>
          <p className="text-xs text-ink-500 max-w-md mx-auto">
            {t('practice.subtitle')}
          </p>
          {deckError && (
            <p role="alert" className="text-sm text-bad-700 max-w-md mx-auto break-words">
              {deckError}
            </p>
          )}
          <button
            onClick={() => handleLoadDrills(activePracticeType)}
            className="h-10 px-4 rounded-md bg-accent-700 text-ink-100 text-sm font-medium hover:bg-ink-800 transition-all cursor-pointer"
          >
            {t('practice.generateDrills')}
          </button>
        </div>
      ) : currentQ ? (
        <div className="p-6 sm:p-8 rounded-lg bg-white border border-ink-200 space-y-6">
          
          {/* Question Header & Counter */}
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-accent-100 text-accent-900">
                {t('practice.questionProgress', { current: activeQuestionIdx + 1, total: deck.questions.length })}
              </span>
              <span className="text-xs text-ink-500 font-medium">
                {deck.title}
              </span>
            </div>
            <button
              onClick={() => speakFrench(currentQ.targetSentence)}
              className="flex items-center gap-1 text-xs text-accent-800 hover:text-accent-900 font-medium cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-ink-600" />
              <span>{t('practice.realTTS')}</span>
            </button>
          </div>

          {/* Question Prompt */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-ink-800">
              {currentQ.prompt}
            </h3>
          </div>

          {/* MODE 1: SCRAMBLE / SYNTAX RECONSTRUCTION */}
          {activePracticeType === 'syntax' && currentQ.scrambledChunks && (
            <div className="space-y-5">
              {/* Target Drop/Assembly Area */}
              <div className="min-h-[72px] p-4 rounded-lg bg-ink-50 border-2 border-dashed border-ink-300 flex flex-wrap items-center gap-2">
                {selectedChunks.length === 0 ? (
                  <span className="text-xs text-ink-400">
                    {t('practice.scramblePrompt')}
                  </span>
                ) : (
                  selectedChunks.map((chunk, idx) => (
                    <span
                      key={idx}
                      onClick={() => handleChunkClick(chunk)}
                      className="h-10 px-4 rounded-md bg-accent-700 text-white font-serif font-semibold text-base cursor-pointer hover:bg-bad-600 transition-colors"
                      title={t('practice.removeChunk')}
                    >
                      {chunk}
                    </span>
                  ))
                )}
              </div>

              {/* Scrambled source chips */}
              <div className="space-y-2">
                <div className="text-xs text-ink-500 font-medium">{t('practice.chunksToOrder')}</div>
                <div className="flex flex-wrap gap-2.5">
                  {currentQ.scrambledChunks.map((chunk, idx) => {
                    const isUsed = selectedChunks.includes(chunk);
                    return (
                      <button
                        key={idx}
                        disabled={isUsed}
                        onClick={() => handleChunkClick(chunk)}
                        className={`px-4 py-2 rounded-lg text-sm font-serif font-semibold border transition-all ${
                          isUsed
                            ? 'opacity-30 bg-ink-100 text-ink-400 border-ink-200'
                            : 'bg-white hover:bg-accent-50 text-accent-950 border-ink-300 hover:border-accent-400 active:scale-95'
                        }`}
                      >
                        {chunk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scramble Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleCheckScramble}
                  disabled={selectedChunks.length === 0}
                  className="h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium hover:bg-ink-800 disabled:opacity-50 transition-all active:scale-95 cursor-pointer"
                >
                  {t('practice.checkAnswer')}
                </button>
                <button
                  onClick={() => {
                    setSelectedChunks([]);
                    setScrambleStatus('idle');
                  }}
                  className="px-3.5 py-2.5 rounded-lg border border-ink-300 text-ink-600 hover:bg-ink-50 text-xs font-medium cursor-pointer"
                >
                  {t('common.retry')}
                </button>
              </div>

              {/* Verification Feedback */}
              {scrambleStatus === 'correct' && (
                <div className="p-4 rounded-lg bg-ok-50 border border-ok-200 space-y-2">
                  <div className="flex items-center gap-2 text-ok-800 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-ok-600" />
                    <span>{t('common.success')}</span>
                  </div>
                  <p className="text-xs text-ink-700 leading-relaxed font-sans">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}

              {scrambleStatus === 'incorrect' && (
                <div className="p-4 rounded-lg bg-bad-50 border border-bad-200 space-y-2">
                  <div className="flex items-center gap-2 text-bad-800 font-semibold text-sm">
                    <XCircle className="w-5 h-5 text-bad-600" />
                    <span>{t('practice.showExplanation')}</span>
                  </div>
                  <div className="text-xs text-ink-600">
                    {currentQ.grammarHint}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: ORAL SHADOWING CHALLENGE */}
          {activePracticeType === 'oral' && (
            <div className="space-y-6">
              <div className="p-5 rounded-lg bg-ink-50 text-ink-900 border border-ink-200 space-y-3">
                <div className="text-xs text-accent-800 font-semibold">
                  {t('sentenceDrawer.shadowingCoach')}
                </div>
                <p className="font-serif text-2xl font-semibold text-ink-900 leading-relaxed">
                  « {currentQ.targetSentence} »
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-ink-800">
                  <button
                    onClick={() => speakFrench(currentQ.targetSentence, { rate: 0.85 })}
                    className="flex items-center gap-2 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4 text-ink-600" />
                    <span>{t('sentenceDrawer.listenAudio')} (0.85x)</span>
                  </button>
                  <span className="text-xs text-ink-500">
                    {t('sentenceDrawer.badge')}
                  </span>
                </div>
              </div>

              {/* Recorder Controls */}
              <div className="p-4 rounded-lg border border-ink-200 bg-ink-50 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <button
                      onClick={handleStartOralRecording}
                      className="flex items-center gap-2 h-10 px-4 rounded-md bg-bad-600 hover:bg-bad-700 text-white text-sm font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      <Mic className="w-4 h-4 text-white" />
                      <span>{t('sentenceDrawer.recordShadowing')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopOralRecording}
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
                        onClick={handleAssessOral}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ok-600 hover:bg-ok-700 disabled:opacity-50 text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer"
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
              </div>

              {/* Oral Assessment Output */}
              {oralAssessment && (
                <div className="p-5 rounded-lg bg-ink-100 border border-ink-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-ink-700" />
                      <span className="font-semibold text-sm text-ink-900">
                        {t('sentenceDrawer.overallScore')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-serif text-3xl font-semibold text-ink-800">
                        {oralAssessment.overallScore}
                      </span>
                      <span className="text-xs text-ink-600">/ 100</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-white border border-ink-200">
                      <div className="text-xs text-ink-500">{t('sentenceDrawer.accuracy')}</div>
                      <div className="text-sm font-semibold text-ok-700">
                        {oralAssessment.accuracyScore}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-ink-200">
                      <div className="text-xs text-ink-500">{t('sentenceDrawer.fluency')}</div>
                      <div className="text-sm font-semibold text-accent-700">
                        {oralAssessment.fluencyScore}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-ink-200">
                      <div className="text-xs text-ink-500">{t('sentenceDrawer.rhythm')}</div>
                      <div className="text-sm font-semibold text-purple-700">
                        {oralAssessment.rhythmScore}
                      </div>
                    </div>
                  </div>

                  {oralAssessment.phonemeFeedback && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-ink-900">{t('sentenceDrawer.coachFeedback')}:</div>
                      {oralAssessment.phonemeFeedback.map((pf, pIdx) => (
                        <div key={pIdx} className="text-xs text-ink-700 bg-white p-2 rounded-md border border-ink-200">
                          <span className="font-mono font-semibold text-ink-800 mr-1.5">{pf.phoneme}</span>
                          <span className="text-ink-600">{pf.tip}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {oralAssessment.coachingNotes && (
                    <div className="text-xs text-ink-800 bg-ink-100 p-3 rounded-lg italic">
                      {oralAssessment.coachingNotes}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODE 3: CLOZE GRAMMAR & TENSE DRILL */}
          {activePracticeType === 'cloze' && (
            <div className="space-y-5">
              <div className="p-5 rounded-lg bg-ink-50 border border-ink-200">
                <p className="font-serif text-xl sm:text-2xl font-semibold text-ink-900 leading-relaxed">
                  {currentQ.clozeText}
                </p>
              </div>

              {currentQ.options && (
                <div className="grid grid-cols-2 gap-3">
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === currentQ.correctOptionIndex;

                    let btnClass = 'bg-white hover:bg-ink-50 border-ink-200 text-ink-800';
                    if (isAnswerRevealed) {
                      if (isCorrect) {
                        btnClass = 'bg-ok-50 border-ok-400 text-ok-900 font-semibold';
                      } else if (isSelected) {
                        btnClass = 'bg-bad-50 border-bad-300 text-bad-800';
                      }
                    } else if (isSelected) {
                      btnClass = 'bg-accent-100 border-accent-500 text-accent-950 font-semibold';
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerRevealed}
                        onClick={() => setSelectedOption(idx)}
                        className={`p-3.5 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${btnClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => setIsAnswerRevealed(true)}
                  disabled={selectedOption === null || isAnswerRevealed}
                  className="h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium hover:bg-ink-800 disabled:opacity-50 cursor-pointer"
                >
                  {t('practice.checkAnswer')}
                </button>
              </div>

              {isAnswerRevealed && (
                <div className="p-4 rounded-lg bg-accent-50 border border-accent-200 space-y-1.5">
                  <div className="text-xs font-semibold text-accent-900">
                    {t('practice.showExplanation')}:
                  </div>
                  <p className="text-xs text-ink-700 leading-relaxed">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Next question button */}
          <div className="pt-4 border-t border-ink-100 flex items-center justify-between">
            <span className="text-xs text-ink-400">
              {activeQuestionIdx + 1} / {deck.questions.length}
            </span>
            {activeQuestionIdx + 1 < deck.questions.length ? (
              <button
                onClick={handleNextQuestion}
                className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium cursor-pointer"
              >
                <span>{t('practice.nextQuestion')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => handleLoadDrills(activePracticeType, true)}
                className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('practice.newDrills')}</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
