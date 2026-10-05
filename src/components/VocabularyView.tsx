import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookmarkCheck, Volume2, Sparkles, RotateCw, CheckCircle2,
  Clock, Search, Trash2, ArrowRight, Layers, Award, Download, Upload, Filter
} from 'lucide-react';
import { VocabWord } from '../types';
import { isDueToday, calculateNextReview } from '../utils/srs';
import { speakFrench } from '../utils/frenchSpeech';

interface VocabularyViewProps {
  vocabList: VocabWord[];
  onUpdateWord: (updatedWord: VocabWord) => void;
  onDeleteWord: (wordId: string) => void;
  onImportVocab?: (words: VocabWord[]) => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  vocabList,
  onUpdateWord,
  onDeleteWord,
  onImportVocab,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [viewMode, setViewMode] = useState<'list' | 'quiz'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'due' | 'learning' | 'mastered'>('all');

  // Flashcard review state
  const dueWords = vocabList.filter(isDueToday);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const currentQuizWord = dueWords[currentIndex];

  const handleStartReview = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewedCount(0);
    setViewMode('quiz');
  };

  const handleRateWord = (rating: number) => {
    if (!currentQuizWord) return;
    const updated = calculateNextReview(currentQuizWord, rating);
    onUpdateWord(updated);
    setReviewedCount((prev) => prev + 1);

    if (currentIndex + 1 < dueWords.length) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      // Completed queue
      setIsFlipped(false);
      setCurrentIndex(dueWords.length);
    }
  };

  // Filter list
  const filteredWords = vocabList.filter((item) => {
    const matchesSearch =
      item.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.contextSentence.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'due') return isDueToday(item);
    if (filterType === 'learning') return item.repetitions < 4;
    if (filterType === 'mastered') return item.repetitions >= 4;

    return true;
  });

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(vocabList, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relire-vocab-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg bg-white border border-ink-200 ">
        <div>
          <h2 className="font-serif font-semibold text-2xl text-ink-900 flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-accent-700" />
            <span>{t('vocab.title')}</span>
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            {t('vocab.subtitle')}
          </p>
        </div>

        {/* Action Button: Start Review */}
        <div className="flex items-center gap-2">
          {dueWords.length > 0 ? (
            <button
              onClick={handleStartReview}
              className="flex items-center gap-2 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium transition-all active:scale-95 cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              <span>{t('vocab.startReview', { count: dueWords.length })}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-ok-50 text-ok-800 border border-ok-200 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-ok-600" />
              <span>{t('vocab.allReviewed')}</span>
            </div>
          )}

          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'quiz' : 'list')}
            className="px-3 py-2 text-xs font-medium rounded-md border border-ink-300 hover:bg-ink-50 text-ink-700 cursor-pointer"
          >
            {viewMode === 'list' ? t('vocab.reviewTitle') : t('vocab.filterAll')}
          </button>
        </div>
      </div>

      {/* QUIZ FLASHCARD MODE */}
      {viewMode === 'quiz' && (
        <div className="max-w-xl mx-auto space-y-4">
          {dueWords.length === 0 || currentIndex >= dueWords.length ? (
            <div className="p-10 rounded-lg bg-white border border-ink-200 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-ok-100 text-ok-600 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8" />
              </div>
              <h3 className="font-serif font-semibold text-2xl text-ink-900">
                {t('vocab.finishReview')}
              </h3>
              <p className="text-sm text-ink-600 max-w-sm mx-auto">
                {t('vocab.allReviewed')}
              </p>
              <button
                onClick={() => setViewMode('list')}
                className="h-10 px-4 rounded-md bg-ink-900 text-ink-100 text-sm font-medium hover:bg-ink-800 cursor-pointer"
              >
                {t('vocab.filterAll')}
              </button>
            </div>
          ) : currentQuizWord ? (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>
                  {currentIndex + 1} / {dueWords.length}
                </span>
                <span>{t('vocab.reviewedCount', { count: reviewedCount })}</span>
              </div>
              <div className="w-full bg-ink-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-accent-600 h-full transition-all duration-300"
                  style={{
                    width: `${((currentIndex + 1) / dueWords.length) * 100}%`,
                  }}
                />
              </div>

              {/* Flashcard */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="p-8 rounded-lg bg-white border-2 border-ink-200 shadow-lg cursor-pointer transition-all hover:border-accent-400 min-h-[320px] flex flex-col justify-between"
              >
                {/* Card Front */}
                <div className="space-y-4 text-center">
                  {currentQuizWord.partOfSpeech && (
                    <span className="text-xs font-semibold text-accent-800 bg-accent-100 px-2.5 py-0.5 rounded-full">
                      {currentQuizWord.partOfSpeech}
                    </span>
                  )}

                  <h3 className="font-serif font-semibold text-4xl sm:text-5xl text-ink-900 tracking-tight">
                    {currentQuizWord.word}
                  </h3>

                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink-600 bg-ink-100 px-3 py-1 rounded-md">
                      {currentQuizWord.ipa}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speakFrench(currentQuizWord.word);
                      }}
                      className="p-1.5 rounded-full bg-accent-100 text-accent-900 hover:bg-accent-200 cursor-pointer"
                      title={t('wordModal.clickToListen')}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {currentQuizWord.contextSentence && (
                    <div className="text-sm font-serif text-ink-600 italic bg-ink-50 p-3 rounded-lg border border-ink-200 max-w-md mx-auto">
                      « {currentQuizWord.contextSentence} »
                    </div>
                  )}
                </div>

                {/* Card Back / Revealed */}
                {isFlipped ? (
                  <div className="pt-6 border-t border-ink-200 space-y-3 text-center">
                    <div className="text-xl font-semibold text-ink-900">
                      {(isEn && currentQuizWord.translationEn) ? currentQuizWord.translationEn : currentQuizWord.translation}
                    </div>

                    {currentQuizWord.contextTense && (
                      <div className="text-xs text-accent-900 bg-accent-50 px-3 py-1.5 rounded-md border border-accent-200/60 font-medium">
                        {currentQuizWord.contextTense}
                      </div>
                    )}

                    {(isEn ? currentQuizWord.phoneticsGuideEn || currentQuizWord.phoneticsGuide : currentQuizWord.phoneticsGuide) && (
                      <p className="text-xs text-ink-500 italic max-w-md mx-auto">
                        {isEn ? (currentQuizWord.phoneticsGuideEn || currentQuizWord.phoneticsGuide) : currentQuizWord.phoneticsGuide}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-accent-800/80 font-medium pt-4">
                    {t('vocab.showAnswer')} →
                  </div>
                )}
              </div>

              {/* SM-2 Recall Feedback Buttons */}
              {isFlipped && (
                <div className="grid grid-cols-4 gap-2 pt-2">
                  <button
                    onClick={() => handleRateWord(1)}
                    className="p-3 rounded-lg bg-bad-50 hover:bg-bad-100 border border-bad-200 text-bad-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateHard')}</span>
                    <span className="text-xs text-bad-600 font-normal">
                      1d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(3)}
                    className="p-3 rounded-lg bg-accent-50 hover:bg-accent-100 border border-accent-200 text-accent-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateGood')}</span>
                    <span className="text-xs text-accent-600 font-normal">
                      3d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(4)}
                    className="p-3 rounded-lg bg-accent-50 hover:bg-accent-100 border border-accent-200 text-accent-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateEasy')}</span>
                    <span className="text-xs text-accent-600 font-normal">
                      6d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(5)}
                    className="p-3 rounded-lg bg-ok-50 hover:bg-ok-100 border border-ok-200 text-ok-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.mastered')}</span>
                    <span className="text-xs text-ok-600 font-normal">
                      12d+
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* VOCABULARY LIST MODE */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-white border border-ink-200">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('vocab.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-ink-50 rounded-md border border-ink-200 focus:outline-none focus:border-accent-600"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex items-center bg-ink-100 p-1 rounded-md text-xs font-medium">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-white text-ink-900 font-semibold'
                      : 'text-ink-600'
                  }`}
                >
                  {t('vocab.filterAll')} ({vocabList.length})
                </button>
                <button
                  onClick={() => setFilterType('due')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'due'
                      ? 'bg-white text-ink-900 font-semibold'
                      : 'text-ink-600'
                  }`}
                >
                  {t('vocab.filterDue')} ({dueWords.length})
                </button>
                <button
                  onClick={() => setFilterType('learning')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'learning'
                      ? 'bg-white text-ink-900 font-semibold'
                      : 'text-ink-600'
                  }`}
                >
                  {t('vocab.filterLearning')}
                </button>
                <button
                  onClick={() => setFilterType('mastered')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'mastered'
                      ? 'bg-white text-ink-900 font-semibold'
                      : 'text-ink-600'
                  }`}
                >
                  {t('vocab.filterMastered')}
                </button>
              </div>

              <button
                onClick={handleExportJSON}
                className="p-2 rounded-md border border-ink-200 text-ink-600 hover:text-ink-900 hover:bg-ink-50 cursor-pointer"
                title={t('vocab.exportJson')}
                aria-label={t('vocab.exportJson')}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Word List Table */}
          {filteredWords.length === 0 ? (
            <div className="p-12 text-center rounded-lg bg-white border border-ink-200">
              <p className="text-ink-500 text-sm">{t('vocab.empty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredWords.map((item) => {
                const isDue = isDueToday(item);

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg bg-white border ${
                      isDue ? 'border-accent-300' : 'border-ink-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-serif font-semibold text-xl text-ink-900">
                            {item.word}
                          </h4>
                          <span className="font-mono text-xs text-accent-900 bg-accent-100/70 px-1.5 py-0.5 rounded-md">
                            {item.ipa}
                          </span>
                          <span className="text-xs text-ink-500">
                            {item.partOfSpeech}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-ink-800 mt-1">
                          {(isEn && item.translationEn) ? item.translationEn : item.translation}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => speakFrench(item.word)}
                          className="p-1.5 rounded-md text-ink-400 hover:text-accent-800 hover:bg-accent-100/50 cursor-pointer"
                          title={t('wordModal.clickToListen')}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteWord(item.id)}
                          className="p-1.5 rounded-md text-ink-400 hover:text-bad-700 hover:bg-ink-100 cursor-pointer"
                          title={t('vocab.deleteConfirm')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Context sentence */}
                    {item.contextSentence && (
                      <p className="mt-2.5 text-xs font-serif text-ink-600 bg-ink-50 p-2 rounded-md border border-ink-100 line-clamp-2 italic">
                        « {item.contextSentence} »
                      </p>
                    )}

                    {/* Context tense note */}
                    {item.contextTense && (
                      <div className="mt-2 text-xs text-accent-900 bg-accent-50/60 px-2 py-0.5 rounded-md border border-accent-100">
                        {item.contextTense}
                      </div>
                    )}

                    {/* SRS status footer */}
                    <div className="mt-3 pt-2 border-t border-ink-100 flex items-center justify-between text-xs text-ink-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-ink-400" />
                        <span>{t('vocab.interval', { days: item.intervalDays })} ({t('vocab.reps', { count: item.repetitions })})</span>
                      </div>
                      <div>
                        {isDue ? (
                          <span className="px-1.5 py-0.5 rounded-md text-xs font-semibold bg-accent-500 text-white">
                            {t('vocab.dueToday')}
                          </span>
                        ) : (
                          <span>{t('vocab.nextReview')} {item.nextReviewDate}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
