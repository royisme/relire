import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, RotateCw, Search, Trash2 } from 'lucide-react';
import { VocabWord } from '../types';
import { isDueToday, calculateNextReview } from '../utils/srs';
import { SpeakButton } from './ui/speak-button';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { Segmented } from './ui/segmented';

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

  const translationOf = (w: VocabWord) => (isEn && w.translationEn ? w.translationEn : w.translation);
  const guideOf = (w: VocabWord) => (isEn ? w.phoneticsGuideEn || w.phoneticsGuide : w.phoneticsGuide);
  const ratings = [
    { rating: 1, label: t('vocab.rateHard'), after: '1d' },
    { rating: 3, label: t('vocab.rateGood'), after: '3d' },
    { rating: 4, label: t('vocab.rateEasy'), after: '6d' },
    { rating: 5, label: t('vocab.mastered'), after: '12d+' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <PageHeader
        title={t('vocab.title')}
        subtitle={t('vocab.subtitle')}
        actions={
          viewMode === 'quiz' ? (
            <Button variant="outline" onClick={() => setViewMode('list')}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>{t('vocab.backToList')}</span>
            </Button>
          ) : (
            <>
              {vocabList.length > 0 && dueWords.length === 0 && <span className="text-sm text-ink-500">{t('vocab.allReviewed')}</span>}
              {dueWords.length > 0 && (
                <Button onClick={handleStartReview}>
                  <RotateCw className="w-4 h-4" aria-hidden="true" />
                  <span>{t('vocab.startReview', { count: dueWords.length })}</span>
                </Button>
              )}
              {vocabList.length > 0 && (
                <Button variant="outline" size="icon" onClick={handleExportJSON} title={t('vocab.exportJson')} aria-label={t('vocab.exportJson')}>
                  <Download className="w-4 h-4" />
                </Button>
              )}
            </>
          )
        }
      />

      {/* Review: one card at a time */}
      {viewMode === 'quiz' && (
        <div className="max-w-xl mx-auto space-y-4">
          {dueWords.length === 0 || currentIndex >= dueWords.length ? (
            <div className="px-6 py-12 rounded-lg bg-surface border border-ink-200 text-center space-y-2">
              <h3 className="font-serif font-semibold text-xl text-ink-900">{t('vocab.finishReview')}</h3>
              <p className="text-sm text-ink-500 tnum">{t('vocab.reviewedCount', { count: reviewedCount })}</p>
            </div>
          ) : currentQuizWord ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-500 tnum">
                  <span>
                    {currentIndex + 1} / {dueWords.length}
                  </span>
                  <span>{t('vocab.reviewedCount', { count: reviewedCount })}</span>
                </div>
                <div className="w-full bg-ink-200 h-1 rounded-full overflow-hidden">
                  <div className="bg-accent-600 h-full transition-all duration-300" style={{ width: `${((currentIndex + 1) / dueWords.length) * 100}%` }} />
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                aria-expanded={isFlipped}
                onClick={() => setIsFlipped(!isFlipped)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setIsFlipped(!isFlipped))}
                className="px-6 py-8 rounded-lg bg-surface border border-ink-200 cursor-pointer transition-colors hover:border-ink-300 min-h-[300px] flex flex-col justify-between gap-6"
              >
                <div className="space-y-3 text-center">
                  {currentQuizWord.partOfSpeech && <p className="text-xs text-ink-500">{currentQuizWord.partOfSpeech}</p>}
                  <h3 className="font-serif font-semibold text-4xl sm:text-5xl text-ink-900 break-words">{currentQuizWord.word}</h3>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm text-ink-600">{currentQuizWord.ipa}</span>
                    <SpeakButton
                      text={currentQuizWord.word}
                      label={t('wordModal.listen')}
                      stopLabel={t('reader.stop')}
                      variant="ghost"
                      size="iconSm"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {currentQuizWord.contextSentence && (
                    <p className="font-serif text-base text-ink-600 italic max-w-md mx-auto break-words">« {currentQuizWord.contextSentence} »</p>
                  )}
                </div>

                {isFlipped ? (
                  <div className="pt-5 border-t border-ink-200 space-y-2 text-center">
                    <p className="text-xl font-medium text-ink-900 break-words">{translationOf(currentQuizWord)}</p>
                    {currentQuizWord.contextTense && <p className="text-sm text-ink-600">{currentQuizWord.contextTense}</p>}
                    {guideOf(currentQuizWord) && <p className="text-sm text-ink-500 max-w-md mx-auto">{guideOf(currentQuizWord)}</p>}
                  </div>
                ) : (
                  <p className="text-center text-sm text-ink-500">{t('vocab.showAnswer')}</p>
                )}
              </div>

              {isFlipped && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ratings.map((r) => (
                    <button
                      key={r.rating}
                      onClick={() => handleRateWord(r.rating)}
                      className="h-14 rounded-md border border-ink-300 bg-surface hover:bg-ink-100 text-sm text-ink-900 flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                    >
                      <span className="font-medium">{r.label}</span>
                      <span className="text-xs text-ink-500 tnum">{r.after}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* List */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 basis-56 min-w-0">
              <span className="sr-only">{t('vocab.searchPlaceholder')}</span>
              <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('vocab.searchPlaceholder')}
                className="w-full h-10 pl-9 pr-3 text-sm bg-surface rounded-md border border-ink-300 focus:outline-none focus:border-accent-600"
              />
            </label>
            <Segmented
              label={t('vocab.title')}
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'all', label: <>{t('vocab.filterAll')} <span className="tnum text-ink-500">{vocabList.length}</span></> },
                { value: 'due', label: <>{t('vocab.filterDue')} <span className="tnum text-ink-500">{dueWords.length}</span></> },
                { value: 'learning', label: t('vocab.filterLearning') },
                { value: 'mastered', label: t('vocab.filterMastered') },
              ]}
            />
          </div>

          {filteredWords.length === 0 ? (
            <div className="px-6 py-12 text-center rounded-lg bg-surface border border-ink-200">
              <p className="text-ink-500 text-sm">{t('vocab.empty')}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredWords.map((item) => {
                const isDue = isDueToday(item);
                return (
                  <li key={item.id} className="p-4 rounded-lg bg-surface border border-ink-200 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                          <h4 className="font-serif font-semibold text-xl text-ink-900 break-words">{item.word}</h4>
                          <span className="font-mono text-xs text-ink-500">{item.ipa}</span>
                          <span className="text-xs text-ink-500">{item.partOfSpeech}</span>
                        </div>
                        <p className="text-sm text-ink-800 mt-0.5 break-words">{translationOf(item)}</p>
                      </div>
                      <div className="flex items-center shrink-0">
                        <SpeakButton
                          text={item.word}
                          label={t('wordModal.listen')}
                          stopLabel={t('reader.stop')}
                          variant="ghost"
                          size="iconSm"
                        />
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => onDeleteWord(item.id)}
                          title={t('library.delete')}
                          aria-label={`${t('library.delete')}: ${item.word}`}
                          className="hover:text-bad-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {item.contextSentence && (
                      <p className="text-sm font-serif italic text-ink-600 line-clamp-2 break-words">« {item.contextSentence} »</p>
                    )}

                    <div className="mt-auto pt-2 border-t border-ink-200 flex items-center justify-between gap-2 text-xs text-ink-500 tnum">
                      <span>
                        {t('vocab.interval', { days: item.intervalDays })} · {t('vocab.reps', { count: item.repetitions })}
                      </span>
                      {isDue ? (
                        <span className="font-medium text-accent-900">{t('vocab.dueToday')}</span>
                      ) : (
                        <span>
                          {t('vocab.nextReview')} {item.nextReviewDate}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
