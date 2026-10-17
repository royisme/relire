import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, RotateCw, Search, Trash2 } from 'lucide-react';
import { VocabWord } from '../types';
import { isDueToday, calculateNextReview } from '../utils/srs';
import { SpeakButton } from './ui/speak-button';
import { Button } from './ui/button';
import { PageHeader } from './ui/page-header';
import { Segmented } from './ui/segmented';
import { Dialog } from './ui/overlay';

interface VocabularyViewProps {
  vocabList: VocabWord[];
  onUpdateWord: (updatedWord: VocabWord) => void;
  onDeleteWord: (wordId: string) => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({ vocabList, onUpdateWord, onDeleteWord }) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [viewMode, setViewMode] = useState<'list' | 'quiz'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'due' | 'learning' | 'mastered'>('all');

  const dueWords = vocabList.filter(isDueToday);
  // Ratings remove words from the live due list, not from this session's queue.
  const [reviewQueue, setReviewQueue] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VocabWord | null>(null);
  const deleteOpener = useRef<HTMLButtonElement>(null);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const opener = deleteOpener.current;
    const search = searchInput.current;
    deleteCancel.current?.focus();
    return () => {
      (opener?.isConnected ? opener : search)?.focus({ preventScroll: true });
    };
  }, [pendingDelete]);

  const currentQuizWord = reviewQueue[currentIndex];

  const handleStartReview = () => {
    setReviewQueue(dueWords);
    setCurrentIndex(0);
    setIsFlipped(false);
    setViewMode('quiz');
  };

  const handleRateWord = (rating: number) => {
    if (!currentQuizWord) return;
    onUpdateWord(calculateNextReview(currentQuizWord, rating));
    setCurrentIndex((prev) => prev + 1);
    setIsFlipped(false);
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
    { rating: 1, label: t('vocab.rateHard') },
    { rating: 3, label: t('vocab.rateGood') },
    { rating: 4, label: t('vocab.rateEasy') },
    { rating: 5, label: t('vocab.mastered') },
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
              {vocabList.length > 0 && dueWords.length === 0 && (
                <span className="text-sm text-ink-500">{t('vocab.allReviewed')}</span>
              )}
              {dueWords.length > 0 && (
                <Button onClick={handleStartReview}>
                  <RotateCw className="w-4 h-4" aria-hidden="true" />
                  <span>{t('vocab.startReview', { count: dueWords.length })}</span>
                </Button>
              )}
              {vocabList.length > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleExportJSON}
                  title={t('vocab.exportJson')}
                  aria-label={t('vocab.exportJson')}
                >
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
          {currentIndex >= reviewQueue.length ? (
            <div className="px-6 py-12 rounded-lg bg-surface border border-ink-200 text-center space-y-2">
              <h3 className="font-serif font-semibold text-xl text-ink-900">{t('vocab.finishReview')}</h3>
              <p className="text-sm text-ink-500 tnum">{t('vocab.reviewedCount', { count: currentIndex })}</p>
            </div>
          ) : currentQuizWord ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-500 tnum">
                  <span>
                    {currentIndex + 1} / {reviewQueue.length}
                  </span>
                  <span>{t('vocab.reviewedCount', { count: currentIndex })}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t('vocab.reviewTitle')}
                  aria-valuemin={0}
                  aria-valuemax={reviewQueue.length}
                  aria-valuenow={currentIndex}
                  className="w-full bg-ink-200 h-1 rounded-full overflow-hidden"
                >
                  <div
                    className="bg-accent-600 h-full transition-all duration-300"
                    style={{ width: `${(currentIndex / reviewQueue.length) * 100}%` }}
                  />
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                aria-expanded={isFlipped}
                onClick={() => setIsFlipped(!isFlipped)}
                onKeyDown={(e) =>
                  (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setIsFlipped(!isFlipped))
                }
                className="px-6 py-8 rounded-lg bg-surface border border-ink-200 cursor-pointer transition-colors hover:border-ink-300 min-h-[300px] flex flex-col justify-between gap-6"
              >
                <div className="space-y-3 text-center">
                  {currentQuizWord.partOfSpeech && (
                    <p className="text-xs text-ink-500">{currentQuizWord.partOfSpeech}</p>
                  )}
                  <h3 className="font-serif font-semibold text-4xl sm:text-5xl text-ink-900 break-words">
                    {currentQuizWord.word}
                  </h3>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm text-ink-600">{currentQuizWord.ipa}</span>
                    <SpeakButton
                      text={currentQuizWord.word}
                      label={t('wordModal.listen')}
                      stopLabel={t('reader.stop')}
                      variant="ghost"
                      size="icon"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {currentQuizWord.contextSentence && (
                    <p className="font-serif text-base text-ink-600 italic max-w-md mx-auto break-words">
                      « {currentQuizWord.contextSentence} »
                    </p>
                  )}
                </div>

                {isFlipped ? (
                  <div className="pt-5 border-t border-ink-200 space-y-2 text-center">
                    <p className="text-xl font-medium text-ink-900 break-words">{translationOf(currentQuizWord)}</p>
                    {currentQuizWord.contextTense && (
                      <p className="text-sm text-ink-600">{currentQuizWord.contextTense}</p>
                    )}
                    {guideOf(currentQuizWord) && (
                      <p className="text-sm text-ink-500 max-w-md mx-auto">{guideOf(currentQuizWord)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-sm text-ink-500">{t('vocab.showAnswer')}</p>
                )}
              </div>

              {isFlipped && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ratings.map((r) => {
                    const preview = calculateNextReview(currentQuizWord, r.rating);
                    return (
                      <button
                        key={r.rating}
                        onClick={() => handleRateWord(r.rating)}
                        className="h-14 rounded-md border border-ink-300 bg-surface hover:bg-ink-100 text-sm text-ink-900 flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                      >
                        <span className="font-medium">{r.label}</span>
                        <span className="text-xs text-ink-500 tnum">
                          {t('vocab.reviewAfter', { count: preview.intervalDays })}
                        </span>
                      </button>
                    );
                  })}
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
                ref={searchInput}
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
                {
                  value: 'all',
                  label: (
                    <>
                      {t('vocab.filterAll')} <span className="tnum text-ink-500">{vocabList.length}</span>
                    </>
                  ),
                },
                {
                  value: 'due',
                  label: (
                    <>
                      {t('vocab.filterDue')} <span className="tnum text-ink-500">{dueWords.length}</span>
                    </>
                  ),
                },
                { value: 'learning', label: t('vocab.filterLearning') },
                { value: 'mastered', label: t('vocab.filterMastered') },
              ]}
            />
          </div>

          {filteredWords.length === 0 ? (
            <div className="px-6 py-12 text-center rounded-lg bg-surface border border-ink-200">
              <p className="text-ink-500 text-sm">{t(vocabList.length === 0 ? 'vocab.empty' : 'vocab.noResults')}</p>
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
                          size="icon"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            deleteOpener.current = e.currentTarget;
                            setPendingDelete(item);
                          }}
                          title={t('library.delete')}
                          aria-label={`${t('library.delete')}: ${item.word}`}
                          className="hover:text-bad-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {item.contextSentence && (
                      <p className="text-sm font-serif italic text-ink-600 line-clamp-2 break-words">
                        « {item.contextSentence} »
                      </p>
                    )}

                    <div className="mt-auto pt-2 border-t border-ink-200 flex items-center justify-between gap-2 text-xs text-ink-500 tnum">
                      <span>
                        {t('vocab.interval', { days: item.intervalDays })} ·{' '}
                        {t('vocab.reps', { count: item.repetitions })}
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

      {pendingDelete && (
        <Dialog label={t('vocab.deleteTitle')} onClose={() => setPendingDelete(null)} className="max-w-sm">
          <div
            className="p-5 space-y-4"
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return;
              const buttons = e.currentTarget.querySelectorAll('button');
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <h3 className="font-serif text-lg font-semibold text-ink-900">{t('vocab.deleteTitle')}</h3>
            <p className="text-sm text-ink-700 break-words">{t('vocab.deleteConfirm', { word: pendingDelete.word })}</p>
            <div className="flex justify-end gap-2">
              <Button ref={deleteCancel} variant="ghost" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDeleteWord(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                {t('library.delete')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
