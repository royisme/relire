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
    a.download = `eclair-vocab-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-white border border-stone-200 shadow-xs">
        <div>
          <h2 className="font-french-serif font-bold text-2xl text-stone-900 flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-blue-700" />
            <span>{t('vocab.title')}</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            {t('vocab.subtitle')}
          </p>
        </div>

        {/* Action Button: Start Review */}
        <div className="flex items-center gap-2">
          {dueWords.length > 0 ? (
            <button
              onClick={handleStartReview}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-all active:scale-95 animate-pulse cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              <span>{t('vocab.startReview', { count: dueWords.length })}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t('vocab.allReviewed')}</span>
            </div>
          )}

          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'quiz' : 'list')}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 cursor-pointer"
          >
            {viewMode === 'list' ? t('vocab.reviewTitle') : t('vocab.filterAll')}
          </button>
        </div>
      </div>

      {/* QUIZ FLASHCARD MODE */}
      {viewMode === 'quiz' && (
        <div className="max-w-xl mx-auto space-y-4">
          {dueWords.length === 0 || currentIndex >= dueWords.length ? (
            <div className="p-10 rounded-xl bg-white border border-stone-200 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8" />
              </div>
              <h3 className="font-french-serif font-bold text-2xl text-stone-900">
                {t('vocab.finishReview')}
              </h3>
              <p className="text-sm text-stone-600 max-w-sm mx-auto">
                {t('vocab.allReviewed')}
              </p>
              <button
                onClick={() => setViewMode('list')}
                className="px-5 py-2.5 rounded-xl bg-stone-900 text-stone-100 font-semibold text-sm hover:bg-stone-800 cursor-pointer"
              >
                {t('vocab.filterAll')}
              </button>
            </div>
          ) : currentQuizWord ? (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>
                  {currentIndex + 1} / {dueWords.length}
                </span>
                <span>{t('vocab.dueCount', { count: reviewedCount })}</span>
              </div>
              <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-600 h-full transition-all duration-300"
                  style={{
                    width: `${((currentIndex + 1) / dueWords.length) * 100}%`,
                  }}
                />
              </div>

              {/* Flashcard */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="p-8 rounded-xl bg-white border-2 border-amber-900/10 shadow-lg cursor-pointer transition-all hover:border-amber-400 min-h-[320px] flex flex-col justify-between"
              >
                {/* Card Front */}
                <div className="space-y-4 text-center">
                  <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    {currentQuizWord.partOfSpeech || 'Mot Français'}
                  </span>

                  <h3 className="font-french-serif font-bold text-4xl sm:text-5xl text-stone-900 tracking-tight">
                    {currentQuizWord.word}
                  </h3>

                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-semibold text-stone-600 bg-stone-100 px-3 py-1 rounded-md">
                      {currentQuizWord.ipa}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speakFrench(currentQuizWord.word);
                      }}
                      className="p-1.5 rounded-full bg-amber-100 text-amber-900 hover:bg-amber-200 cursor-pointer"
                      title={t('wordModal.clickToListen')}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {currentQuizWord.contextSentence && (
                    <div className="text-sm font-french-serif text-stone-600 italic bg-stone-50 p-3 rounded-xl border border-stone-200/60 max-w-md mx-auto">
                      « {currentQuizWord.contextSentence} »
                    </div>
                  )}
                </div>

                {/* Card Back / Revealed */}
                {isFlipped ? (
                  <div className="pt-6 border-t border-stone-200 space-y-3 text-center animate-in fade-in duration-200">
                    <div className="text-xl font-bold text-stone-900">
                      {(isEn && currentQuizWord.translationEn) ? currentQuizWord.translationEn : currentQuizWord.translation}
                    </div>

                    {currentQuizWord.contextTense && (
                      <div className="text-xs text-blue-900 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200/60 font-medium">
                        {currentQuizWord.contextTense}
                      </div>
                    )}

                    {(isEn ? currentQuizWord.phoneticsGuideEn || currentQuizWord.phoneticsGuide : currentQuizWord.phoneticsGuide) && (
                      <p className="text-xs text-stone-500 italic max-w-md mx-auto">
                        {isEn ? (currentQuizWord.phoneticsGuideEn || currentQuizWord.phoneticsGuide) : currentQuizWord.phoneticsGuide}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-amber-800/80 font-medium pt-4">
                    {t('vocab.showAnswer')} →
                  </div>
                )}
              </div>

              {/* SM-2 Recall Feedback Buttons */}
              {isFlipped && (
                <div className="grid grid-cols-4 gap-2 pt-2 animate-in fade-in duration-300">
                  <button
                    onClick={() => handleRateWord(1)}
                    className="p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateHard')}</span>
                    <span className="text-[10px] text-rose-600 font-normal">
                      1d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(3)}
                    className="p-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateGood')}</span>
                    <span className="text-[10px] text-amber-600 font-normal">
                      3d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(4)}
                    className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.rateEasy')}</span>
                    <span className="text-[10px] text-blue-600 font-normal">
                      6d
                    </span>
                  </button>
                  <button
                    onClick={() => handleRateWord(5)}
                    className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-semibold flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  >
                    <span>{t('vocab.mastered')}</span>
                    <span className="text-[10px] text-emerald-600 font-normal">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-stone-200">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('vocab.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 rounded-lg border border-stone-200 focus:outline-none focus:border-amber-600"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex items-center bg-stone-100 p-1 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600'
                  }`}
                >
                  {t('vocab.filterAll')} ({vocabList.length})
                </button>
                <button
                  onClick={() => setFilterType('due')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'due'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600'
                  }`}
                >
                  {t('vocab.filterDue')} ({dueWords.length})
                </button>
                <button
                  onClick={() => setFilterType('learning')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'learning'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600'
                  }`}
                >
                  {t('vocab.filterLearning')}
                </button>
                <button
                  onClick={() => setFilterType('mastered')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterType === 'mastered'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600'
                  }`}
                >
                  {t('vocab.filterMastered')}
                </button>
              </div>

              <button
                onClick={handleExportJSON}
                className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 cursor-pointer"
                title="JSON"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Word List Table */}
          {filteredWords.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-white border border-stone-200">
              <p className="text-stone-500 text-sm">{t('vocab.empty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredWords.map((item) => {
                const isDue = isDueToday(item);

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl bg-white border transition-all hover:shadow-sm ${
                      isDue ? 'border-amber-400/80 bg-amber-50/15' : 'border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-french-serif font-bold text-xl text-stone-900">
                            {item.word}
                          </h4>
                          <span className="font-mono text-xs text-amber-900 bg-amber-100/70 px-1.5 py-0.5 rounded">
                            {item.ipa}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            {item.partOfSpeech}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-stone-800 mt-1">
                          {(isEn && item.translationEn) ? item.translationEn : item.translation}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => speakFrench(item.word)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-amber-800 hover:bg-amber-100/50 cursor-pointer"
                          title={t('wordModal.clickToListen')}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteWord(item.id)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-700 hover:bg-stone-100 cursor-pointer"
                          title={t('vocab.deleteConfirm')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Context sentence */}
                    {item.contextSentence && (
                      <p className="mt-2.5 text-xs font-french-serif text-stone-600 bg-stone-50 p-2 rounded-lg border border-stone-100 line-clamp-2 italic">
                        « {item.contextSentence} »
                      </p>
                    )}

                    {/* Context tense note */}
                    {item.contextTense && (
                      <div className="mt-2 text-[11px] text-blue-900 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
                        {item.contextTense}
                      </div>
                    )}

                    {/* SRS status footer */}
                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>{t('vocab.interval', { days: item.intervalDays })} ({t('vocab.reps', { count: item.repetitions })})</span>
                      </div>
                      <div>
                        {isDue ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
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
