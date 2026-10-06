import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, RotateCcw, ArrowRight, Loader2 } from 'lucide-react';
import { Article, PracticeDeck, PracticeQuestion, PronunciationAssessment } from '../types';
import { generatePracticeDrills, MissingApiKeyError } from '../services/api';
import { stopSpeech } from '../utils/speech';
import { SpeakButton } from './ui/speak-button';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { Segmented } from './ui/segmented';
import { cleanArticleTitle } from '../utils/i18nHelpers';
import { ShadowingRecorder } from './shadowing/ShadowingRecorder';

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
  const { t } = useTranslation();
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
          className="h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-on-fill text-sm font-medium cursor-pointer"
        >
          {t('practice.openLibrary')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      <PageHeader title={t('practice.title')} subtitle={cleanArticleTitle(currentArticle.title)} />

      <Segmented
        label={t('practice.title')}
        value={activePracticeType}
        onChange={(type) => handleLoadDrills(type)}
        options={[
          { value: 'syntax', label: t('practice.tabSyntax') },
          { value: 'cloze', label: t('practice.tabCloze') },
          { value: 'oral', label: t('practice.tabOral') },
        ]}
      />

      {/* Loading Deck State */}
      {isLoadingDeck ? (
        <div className="py-20 text-center rounded-lg bg-surface border border-ink-200">
          <Loader2 className="w-6 h-6 text-ink-500 animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-ink-600">{t('practice.generating')}</p>
        </div>
      ) : !deck ? (
        <div className="px-6 py-12 text-center rounded-lg bg-surface border border-ink-200 space-y-3">
          <p className="text-sm text-ink-600 max-w-md mx-auto">{t('practice.subtitle')}</p>
          {deckError && (
            <p role="alert" className="text-sm text-bad-700 max-w-md mx-auto break-words">
              {deckError}
            </p>
          )}
          <Button onClick={() => handleLoadDrills(activePracticeType)}>{t('practice.generateDrills')}</Button>
        </div>
      ) : currentQ ? (
        <div className="p-6 sm:p-8 rounded-lg bg-surface border border-ink-200 space-y-6">
          
          {/* Question Header & Counter */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-200 pb-3">
            <p className="min-w-0 text-sm text-ink-500 tnum">
              {t('practice.questionProgress', { current: activeQuestionIdx + 1, total: deck.questions.length })}
            </p>
            <SpeakButton
              text={currentQ.targetSentence}
              label={t('practice.realTTS')}
              stopLabel={t('reader.stop')}
              variant="ghost"
              size="sm"
              showLabel
            />
          </div>

          {/* Question Prompt */}
          <div className="space-y-1">
            <h3 className="text-base font-medium text-ink-900">
              {currentQ.prompt}
            </h3>
          </div>

          {/* MODE 1: SCRAMBLE / SYNTAX RECONSTRUCTION */}
          {activePracticeType === 'syntax' && currentQ.scrambledChunks && (
            <div className="space-y-5">
              {/* Target Drop/Assembly Area */}
              <div className="min-h-[72px] p-3 rounded-lg bg-ink-50 border border-dashed border-ink-300 flex flex-wrap items-center gap-2">
                {selectedChunks.length === 0 ? (
                  <span className="text-xs text-ink-400">
                    {t('practice.scramblePrompt')}
                  </span>
                ) : (
                  selectedChunks.map((chunk, idx) => (
                    <span
                      key={idx}
                      onClick={() => handleChunkClick(chunk)}
                      className="inline-flex items-center h-10 px-4 rounded-md bg-accent-700 text-on-fill font-serif text-base cursor-pointer hover:bg-accent-800 transition-colors"
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
                        className={`h-10 px-4 rounded-md text-base font-serif border transition-colors ${
                          isUsed
                            ? 'opacity-40 bg-ink-100 text-ink-500 border-ink-200'
                            : 'bg-surface hover:bg-accent-50 text-ink-900 border-ink-300 hover:border-accent-400 cursor-pointer'
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
                <Button onClick={handleCheckScramble} disabled={selectedChunks.length === 0}>
                  {t('practice.checkAnswer')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedChunks([]);
                    setScrambleStatus('idle');
                  }}
                >
                  {t('common.retry')}
                </Button>
              </div>

              {/* Verification Feedback */}
              {scrambleStatus === 'correct' && (
                <div className="p-4 rounded-lg bg-ok-50 border border-ok-200 space-y-2">
                  <div className="flex items-center gap-2 text-ok-800 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-ok-800" />
                    <span>{t('common.success')}</span>
                  </div>
                  <p className="text-sm text-ink-800 leading-relaxed">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}

              {scrambleStatus === 'incorrect' && (
                <div className="p-4 rounded-lg bg-bad-50 border border-bad-200 space-y-2">
                  <div className="flex items-center gap-2 text-bad-800 font-semibold text-sm">
                    <XCircle className="w-5 h-5 text-bad-700" />
                    <span>{t('practice.showExplanation')}</span>
                  </div>
                  <p className="text-sm text-ink-800 leading-relaxed">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* MODE 2: ORAL SHADOWING CHALLENGE */}
          {activePracticeType === 'oral' && (
            <div className="space-y-5">
              <div className="p-5 rounded-lg bg-ink-50 border border-ink-200 space-y-4">
                <p className="font-serif text-xl sm:text-2xl font-semibold text-ink-900 leading-relaxed break-words">
                  « {currentQ.targetSentence} »
                </p>
                <SpeakButton
                  text={currentQ.targetSentence}
                  rate={0.85}
                  label={`${t('sentenceDrawer.listenAudio')} (0.85x)`}
                  stopLabel={t('reader.stop')}
                  variant="outline"
                  showLabel
                />
              </div>

              <ShadowingRecorder key={activeQuestionIdx} referenceText={currentQ.targetSentence} onAssessed={onRecordAssessmentComplete} />
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

                    let btnClass = 'bg-surface hover:bg-ink-50 border-ink-300 text-ink-900';
                    if (isAnswerRevealed) {
                      if (isCorrect) {
                        btnClass = 'bg-ok-50 border-ok-400 text-ok-900';
                      } else if (isSelected) {
                        btnClass = 'bg-bad-50 border-bad-300 text-bad-800';
                      }
                    } else if (isSelected) {
                      btnClass = 'bg-accent-100 border-accent-600 text-accent-950';
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerRevealed}
                        onClick={() => setSelectedOption(idx)}
                        className={`min-h-12 px-3.5 py-2.5 rounded-md border font-serif text-base transition-colors cursor-pointer break-words ${btnClass}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <Button onClick={() => setIsAnswerRevealed(true)} disabled={selectedOption === null || isAnswerRevealed}>
                  {t('practice.checkAnswer')}
                </Button>
              </div>

              {isAnswerRevealed && (
                <div className="p-4 rounded-lg bg-ink-50 border border-ink-200 space-y-1">
                  <div className="text-xs font-medium text-ink-500">{t('practice.showExplanation')}</div>
                  <p className="text-sm text-ink-800 leading-relaxed">
                    {currentQ.grammarHint}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Next question button */}
          <div className="pt-4 border-t border-ink-200 flex justify-end">
            {activeQuestionIdx + 1 < deck.questions.length ? (
              <Button variant="outline" onClick={handleNextQuestion}>
                <span>{t('practice.nextQuestion')}</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button variant="outline" onClick={() => handleLoadDrills(activePracticeType, true)}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>{t('practice.newDrills')}</span>
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
