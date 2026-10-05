import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dumbbell, Sparkles, Mic, Volume2, CheckCircle2, XCircle, RotateCcw,
  ArrowRight, Square, Award, BookOpen, Layers, MessageSquare, Loader2
} from 'lucide-react';
import { Article, PracticeDeck, PracticeQuestion, PronunciationAssessment } from '../types';
import { generatePracticeDrills, assessPronunciation } from '../services/api';
import { speakFrench, stopSpeech, FrenchAudioRecorder } from '../utils/frenchSpeech';

interface PracticeViewProps {
  currentArticle: Article;
  onRecordAssessmentComplete: (assessment: PronunciationAssessment, sentence: string) => void;
}

export const PracticeView: React.FC<PracticeViewProps> = ({
  currentArticle,
  onRecordAssessmentComplete,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [activePracticeType, setActivePracticeType] = useState<'syntax' | 'oral' | 'cloze'>('syntax');
  const [isLoadingDeck, setIsLoadingDeck] = useState(false);
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
  const handleLoadDrills = async (type: 'syntax' | 'oral' | 'cloze') => {
    setActivePracticeType(type);
    setIsLoadingDeck(true);
    setDeck(null);
    setActiveQuestionIdx(0);
    resetQuestionState();

    try {
      const result = await generatePracticeDrills(currentArticle.content, type);
      setDeck(result);
    } catch (err) {
      console.error('Failed to load practice deck:', err);
      // Fallback local drill deck if API has temporary issue
      setDeck({
        title: type === 'syntax'
          ? (isEn ? 'Sentence Scramble Drill' : '长难句重组训练')
          : type === 'oral'
          ? (isEn ? 'Oral Shadowing Drill' : '影子跟读口语强化')
          : (isEn ? 'Tense & Cloze Drill' : '时态填空专练'),
        description: isEn
          ? 'Targeted drill based on key complex sentences from the article'
          : '基于当前文章核心长难句定制的专项强化模块',
        questions: [
          {
            id: 1,
            type: type === 'syntax' ? 'scramble' : type === 'oral' ? 'oral_prompt' : 'cloze',
            targetSentence: "On ne voit bien qu'avec le cœur, l'essentiel est invisible pour les yeux.",
            prompt: isEn
              ? "Reconstruct the scrambled thought groups into the classic restrictive negative sentence (ne... que):"
              : '请将以下乱序语法意群重组成经典的复合否定限制句（ne... que）:',
            scrambledChunks: [
              "On ne voit bien",
              "qu'avec le cœur,",
              "l'essentiel est invisible",
              "pour les yeux."
            ],
            clozeText: "On ne voit bien ____ avec le cœur, l'essentiel est invisible pour les yeux.",
            options: ["qu'", "que", "dont", "sans"],
            correctOptionIndex: 0,
            grammarHint: isEn
              ? "ne... que is a restrictive negation (meaning 'only/just'), eliding to qu' before a vowel."
              : "ne... que 为限制性否定（表示'只，仅'），辅音或元音前缩合为 qu'。",
            shadowingAudioPrompt: "On ne voit bien qu'avec le cœur, l'essentiel est invisible pour les yeux."
          },
          {
            id: 2,
            type: type === 'syntax' ? 'scramble' : type === 'oral' ? 'oral_prompt' : 'cloze',
            targetSentence: "Bien que le rythme de la capitale se soit considérablement accéléré, cette tradition demeure inébranlable.",
            prompt: isEn
              ? "Reconstruct the complex sentence featuring a concessive clause (Bien que + subjunctive):"
              : '请重组带有让步从句（Bien que + 虚拟式）的长难句:',
            scrambledChunks: [
              "Bien que le rythme",
              "de la capitale",
              "se soit considérablement accéléré,",
              "cette tradition",
              "demeure inébranlable."
            ],
            clozeText: "Bien que le rythme de la capitale se ____ considérablement accéléré, cette tradition demeure inébranlable.",
            options: ["soit", "est", "serait", "fut"],
            correctOptionIndex: 0,
            grammarHint: isEn
              ? "The conjunction phrase Bien que must be followed by the subjunctive mood (se soit accéléré)."
              : "连词短语 Bien que 之后必须接从属虚拟式（se soit accéléré）。",
            shadowingAudioPrompt: "Bien que le rythme de la capitale se soit considérablement accéléré, cette tradition demeure inébranlable."
          }
        ]
      });
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Header */}
      <div className="p-5 rounded-xl bg-white border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-french-serif font-bold text-2xl text-stone-900 flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-rose-600" />
            <span>{t('practice.title')}</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            {t('practice.subtitle')} — 《{currentArticle.title}》
          </p>
        </div>

        {/* Practice Mode Selector Tabs */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-semibold">
          <button
            onClick={() => handleLoadDrills('syntax')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activePracticeType === 'syntax'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span>{t('practice.tabSyntax')}</span>
          </button>

          <button
            onClick={() => handleLoadDrills('oral')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activePracticeType === 'oral'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-rose-600" />
            <span>{t('practice.tabOral')}</span>
          </button>

          <button
            onClick={() => handleLoadDrills('cloze')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activePracticeType === 'cloze'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>{t('practice.tabCloze')}</span>
          </button>
        </div>
      </div>

      {/* Loading Deck State */}
      {isLoadingDeck ? (
        <div className="py-20 text-center rounded-xl bg-white border border-stone-200">
          <Loader2 className="w-10 h-10 text-amber-700 animate-spin mx-auto mb-3" />
          <h3 className="font-french-serif font-bold text-lg text-stone-800">
            {t('practice.generating')}
          </h3>
        </div>
      ) : !deck ? (
        <div className="p-12 text-center rounded-xl bg-white border border-stone-200 space-y-3">
          <Sparkles className="w-10 h-10 text-amber-600 mx-auto" />
          <h3 className="font-french-serif font-bold text-xl text-stone-900">
            {t('practice.title')}
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            {t('practice.subtitle')}
          </p>
          <button
            onClick={() => handleLoadDrills(activePracticeType)}
            className="px-5 py-2.5 rounded-xl bg-stone-900 text-stone-100 font-semibold text-xs hover:bg-stone-800 transition-all cursor-pointer"
          >
            {t('practice.generateDrills')}
          </button>
        </div>
      ) : currentQ ? (
        <div className="p-6 sm:p-8 rounded-xl bg-white border border-stone-200 shadow-sm space-y-6">
          
          {/* Question Header & Counter */}
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900">
                {t('practice.questionProgress', { current: activeQuestionIdx + 1, total: deck.questions.length })}
              </span>
              <span className="text-xs text-stone-500 font-medium">
                {deck.title}
              </span>
            </div>
            <button
              onClick={() => speakFrench(currentQ.targetSentence)}
              className="flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 font-medium cursor-pointer"
            >
              <Volume2 className="w-4 h-4 text-emerald-700" />
              <span>{t('practice.realTTS')}</span>
            </button>
          </div>

          {/* Question Prompt */}
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-stone-800">
              {currentQ.prompt}
            </h3>
          </div>

          {/* MODE 1: SCRAMBLE / SYNTAX RECONSTRUCTION */}
          {activePracticeType === 'syntax' && currentQ.scrambledChunks && (
            <div className="space-y-5">
              {/* Target Drop/Assembly Area */}
              <div className="min-h-[72px] p-4 rounded-xl bg-stone-50 border-2 border-dashed border-stone-300 flex flex-wrap items-center gap-2">
                {selectedChunks.length === 0 ? (
                  <span className="text-xs text-stone-400">
                    {t('practice.scramblePrompt')}
                  </span>
                ) : (
                  selectedChunks.map((chunk, idx) => (
                    <span
                      key={idx}
                      onClick={() => handleChunkClick(chunk)}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-french-serif font-bold text-base shadow-xs cursor-pointer hover:bg-rose-600 transition-colors animate-in zoom-in-95 duration-150"
                      title={t('practice.removeChunk')}
                    >
                      {chunk}
                    </span>
                  ))
                )}
              </div>

              {/* Scrambled source chips */}
              <div className="space-y-2">
                <div className="text-xs text-stone-500 font-medium">{t('practice.chunksToOrder')}</div>
                <div className="flex flex-wrap gap-2.5">
                  {currentQ.scrambledChunks.map((chunk, idx) => {
                    const isUsed = selectedChunks.includes(chunk);
                    return (
                      <button
                        key={idx}
                        disabled={isUsed}
                        onClick={() => handleChunkClick(chunk)}
                        className={`px-4 py-2 rounded-xl text-sm font-french-serif font-semibold border transition-all ${
                          isUsed
                            ? 'opacity-30 bg-stone-100 text-stone-400 border-stone-200'
                            : 'bg-white hover:bg-amber-50 text-amber-950 border-stone-300 hover:border-amber-400 active:scale-95'
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
                  className="px-5 py-2.5 rounded-xl bg-stone-900 text-white font-semibold text-xs hover:bg-stone-800 disabled:opacity-50 transition-all active:scale-95 cursor-pointer"
                >
                  {t('practice.checkAnswer')}
                </button>
                <button
                  onClick={() => {
                    setSelectedChunks([]);
                    setScrambleStatus('idle');
                  }}
                  className="px-3.5 py-2.5 rounded-xl border border-stone-300 text-stone-600 hover:bg-stone-50 text-xs font-medium cursor-pointer"
                >
                  {t('common.retry')}
                </button>
              </div>

              {/* Verification Feedback */}
              {scrambleStatus === 'correct' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{t('common.success')}</span>
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed font-french-sans">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}

              {scrambleStatus === 'incorrect' && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                    <XCircle className="w-5 h-5 text-rose-600" />
                    <span>{t('practice.showExplanation')}</span>
                  </div>
                  <div className="text-xs text-stone-600">
                    {currentQ.grammarHint}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: ORAL SHADOWING CHALLENGE */}
          {activePracticeType === 'oral' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-stone-900 text-white space-y-3">
                <div className="text-xs text-amber-400 font-semibold">
                  {t('sentenceDrawer.shadowingCoach')}
                </div>
                <p className="font-french-serif text-2xl font-bold text-stone-100 leading-relaxed">
                  « {currentQ.targetSentence} »
                </p>

                <div className="pt-2 flex items-center justify-between border-t border-stone-800">
                  <button
                    onClick={() => speakFrench(currentQ.targetSentence, { rate: 0.85 })}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4 text-amber-200" />
                    <span>{t('sentenceDrawer.listenAudio')} (0.85x)</span>
                  </button>
                  <span className="text-xs text-stone-400">
                    {t('sentenceDrawer.badge')}
                  </span>
                </div>
              </div>

              {/* Recorder Controls */}
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {!isRecording ? (
                    <button
                      onClick={handleStartOralRecording}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      <Mic className="w-4 h-4 text-white" />
                      <span>{t('sentenceDrawer.recordShadowing')}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStopOralRecording}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-amber-950" />
                      <span>{t('common.done')} ({recordingSeconds}s)</span>
                    </button>
                  )}

                  {recordedAudioUrl && !isRecording && (
                    <div className="flex items-center gap-2">
                      <audio controls src={recordedAudioUrl} className="h-8 max-w-[200px]" />
                      <button
                        onClick={handleAssessOral}
                        disabled={isEvaluating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs transition-all active:scale-95 cursor-pointer"
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
              </div>

              {/* Oral Assessment Output */}
              {oralAssessment && (
                <div className="p-5 rounded-xl bg-stone-100 border border-stone-200 space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-stone-700" />
                      <span className="font-bold text-sm text-stone-900">
                        {t('sentenceDrawer.overallScore')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-french-serif text-3xl font-bold text-stone-800">
                        {oralAssessment.overallScore}
                      </span>
                      <span className="text-xs text-stone-600">/ 100</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-white border border-stone-200">
                      <div className="text-[10px] text-stone-500">{t('sentenceDrawer.accuracy')}</div>
                      <div className="text-sm font-bold text-emerald-700">
                        {oralAssessment.accuracyScore}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-stone-200">
                      <div className="text-[10px] text-stone-500">{t('sentenceDrawer.fluency')}</div>
                      <div className="text-sm font-bold text-blue-700">
                        {oralAssessment.fluencyScore}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-stone-200">
                      <div className="text-[10px] text-stone-500">{t('sentenceDrawer.rhythm')}</div>
                      <div className="text-sm font-bold text-purple-700">
                        {oralAssessment.rhythmScore}
                      </div>
                    </div>
                  </div>

                  {oralAssessment.phonemeFeedback && (
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-stone-900">{t('sentenceDrawer.coachFeedback')}:</div>
                      {oralAssessment.phonemeFeedback.map((pf, pIdx) => (
                        <div key={pIdx} className="text-xs text-stone-700 bg-white p-2 rounded-lg border border-stone-200">
                          <span className="font-mono font-bold text-stone-800 mr-1.5">{pf.phoneme}</span>
                          <span className="text-stone-600">{pf.tip}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {oralAssessment.coachingNotes && (
                    <div className="text-xs text-stone-800 bg-stone-100 p-3 rounded-xl italic">
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
              <div className="p-5 rounded-xl bg-stone-50 border border-stone-200">
                <p className="font-french-serif text-xl sm:text-2xl font-bold text-stone-900 leading-relaxed">
                  {currentQ.clozeText}
                </p>
              </div>

              {currentQ.options && (
                <div className="grid grid-cols-2 gap-3">
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = selectedOption === idx;
                    const isCorrect = idx === currentQ.correctOptionIndex;

                    let btnClass = 'bg-white hover:bg-stone-50 border-stone-200 text-stone-800';
                    if (isAnswerRevealed) {
                      if (isCorrect) {
                        btnClass = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold';
                      } else if (isSelected) {
                        btnClass = 'bg-rose-50 border-rose-300 text-rose-800';
                      }
                    } else if (isSelected) {
                      btnClass = 'bg-amber-100 border-amber-500 text-amber-950 font-bold';
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerRevealed}
                        onClick={() => setSelectedOption(idx)}
                        className={`p-3.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${btnClass}`}
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
                  className="px-5 py-2.5 rounded-xl bg-stone-900 text-white font-semibold text-xs hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
                >
                  {t('practice.checkAnswer')}
                </button>
              </div>

              {isAnswerRevealed && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5 animate-in fade-in duration-200">
                  <div className="text-xs font-bold text-blue-900">
                    {t('practice.showExplanation')}:
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Next question button */}
          <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-400">
              {activeQuestionIdx + 1} / {deck.questions.length}
            </span>
            {activeQuestionIdx + 1 < deck.questions.length ? (
              <button
                onClick={handleNextQuestion}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                <span>{t('practice.nextQuestion')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => handleLoadDrills(activePracticeType)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('practice.generateDrills')}</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
