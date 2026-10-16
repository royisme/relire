import React, { useState, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/shell/Header';
import { Sidebar } from './components/shell/Sidebar';
import { NotFoundView } from './components/shell/NotFoundView';
import { ReaderView } from './components/ReaderView';
import { WordDetailModal } from './components/WordDetailModal';
import { SentenceDrawer } from './components/SentenceDrawer';
import { StudyView } from './components/study/StudyView';
import { PracticeView } from './components/PracticeView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ArticleEditorDialog } from './components/ArticleEditorDialog';
import { LibraryView } from './components/LibraryView';
import { OnboardingDialog } from './components/OnboardingDialog';
import { SettingsPage } from './components/settings/SettingsPage';
import type { KeyRequest } from './components/settings/keyRequest';

import { Article, VocabWord, WordAnalysis, SentenceAnalysis, UserStats, PronunciationAssessment } from './types';
import { SAMPLE_ARTICLES } from './data/sampleArticles';
import {
  deleteArticleData,
  EMPTY_STATS,
  getDbNotice,
  loadData,
  saveArticles,
  saveStats,
  saveVocab,
  subscribeDbNotice,
} from './storage/db';
import { usePersist } from './storage/usePersist';
import { fetchWordAnalysis, fetchSentenceAnalysis, MissingApiKeyError } from './services/api';
import { isDueToday, formatDate } from './utils/srs';
import { prefetchSpeech } from './utils/speech';
import { hasTextKey } from './utils/appSettings';
import { LIBRARY, parseRoute } from './utils/routes';
import { navigate, useRoute } from './hooks/useRoute';
import { useBreakpoint } from './hooks/useMediaQuery';
import { useSidebar } from './hooks/useSidebar';

const ONBOARDING_KEY = 'relire_onboarded';
const storedFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export default function App() {
  const { t } = useTranslation();
  // Where the learner is: the address decides the screen (see utils/routes.ts).
  const route = useRoute();
  const breakpoint = useBreakpoint();
  const sidebar = useSidebar(route.name === 'reader');
  // The article the log opens at (set when the reader sends the learner to its recordings).
  const [logArticleId, setLogArticleId] = useState<string | null>(null);
  // A sentence to bring into view when the reader opens (from the shadowing log). Shown once.
  const [readerFocus, setReaderFocus] = useState<{ articleId: string; text: string } | null>(null);
  // The article Drills works on: the one most recently read.
  const [lastArticleId, setLastArticleId] = useState<string | null>(null);
  // Set while an AI feature is waiting for a key, so Settings can focus the field and offer the way back.
  const [keyRequest, setKeyRequest] = useState<KeyRequest | null>(null);
  // Data lives in IndexedDB (see src/storage). It loads once, then every change is saved.
  const [ready, setReady] = useState(false);
  const dbNotice = useSyncExternalStore(subscribeDbNotice, getDbNotice);
  const [failedSaves, setFailedSaves] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const currentArticle = route.name === 'reader' ? (articles.find((a) => a.id === route.articleId) ?? null) : null;
  const [editor, setEditor] = useState<{ article: Article | null } | null>(null);
  const [hasKey, setHasKey] = useState(() => hasTextKey());
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);

  // State that belongs to one place is dropped when the learner leaves it (adjusted while rendering, not in an effect).
  if (currentArticle && lastArticleId !== currentArticle.id) setLastArticleId(currentArticle.id);
  if (readerFocus && readerFocus.articleId !== currentArticle?.id) setReaderFocus(null);
  if (logArticleId && route.name !== 'study') setLogArticleId(null);
  if (keyRequest && route.name !== 'settings') setKeyRequest(null);

  const reportSave = (name: string, error: unknown) => {
    if (error) console.error(`Saving ${name} failed`, error);
    setFailedSaves((prev) => (error ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));
  };

  useEffect(() => {
    let cancelled = false;
    void loadData()
      .catch((err) => {
        reportSave('load', err);
        return null;
      })
      .then((data) => {
        if (cancelled) return;
        const first = data ?? { articles: SAMPLE_ARTICLES, vocab: [], stats: EMPTY_STATS };
        setArticles(first.articles);
        setVocabList(first.vocab);
        setStats(first.stats);
        setReady(true);
        // First visit with no key: walk the user through setup.
        if (!storedFlag(ONBOARDING_KEY) && !hasTextKey()) setOnboardingOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  usePersist('articles', articles, saveArticles, ready, reportSave);
  usePersist('vocabulary', vocabList, saveVocab, ready, reportSave);
  usePersist('stats', stats, saveStats, ready, reportSave);

  // Word Detail Modal state
  const [isWordModalOpen, setIsWordModalOpen] = useState(false);
  const [activeWord, setActiveWord] = useState<string | null>(null);
  const [wordData, setWordData] = useState<WordAnalysis | null>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);
  const [activeWordSentence, setActiveWordSentence] = useState('');

  // Sentence Drawer state
  const [isSentenceDrawerOpen, setIsSentenceDrawerOpen] = useState(false);
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [sentenceData, setSentenceData] = useState<SentenceAnalysis | null>(null);
  const [isSentenceLoading, setIsSentenceLoading] = useState(false);

  // AI failures: a missing key sends the user to Settings, anything else is shown in the sheet.
  const [aiError, setAiError] = useState<string | null>(null);

  // Settings → Text AI with the key field ready; its way back is wherever the learner is now.
  const requestKey = () => {
    const here = window.location.hash || '#/read';
    const inSettings = parseRoute(window.location.hash).route.name === 'settings';
    setKeyRequest({ id: Date.now(), returnTo: inSettings ? null : here });
    navigate({ name: 'settings', section: 'text-ai' });
  };

  const handleAiError = (err: unknown, closeSheet: () => void) => {
    if (err instanceof MissingApiKeyError) {
      closeSheet();
      requestKey();
      return;
    }
    setAiError(err instanceof Error ? err.message : String(err));
  };

  // Word Click Handler
  const handleWordClick = async (word: string, sentence: string) => {
    // Strip leading/trailing punctuation while preserving French accents
    const cleanWord = word.trim().replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
    if (!cleanWord) return;

    setActiveWord(cleanWord);
    setActiveWordSentence(sentence);
    setIsWordModalOpen(true);
    setIsWordLoading(true);
    setWordData(null);
    setAiError(null);

    try {
      const data = await fetchWordAnalysis(cleanWord, sentence, currentArticle?.content);
      if (data && data.word) {
        setWordData(data);
      } else {
        throw new Error('Empty word analysis returned');
      }
    } catch (err) {
      handleAiError(err, () => setIsWordModalOpen(false));
    } finally {
      setIsWordLoading(false);
    }
  };

  const handleRetryWord = () => {
    if (activeWord) {
      void handleWordClick(activeWord, activeWordSentence);
    }
  };

  // Sentence Click Handler
  const handleSentenceClick = async (sentence: string) => {
    if (!sentence.trim()) return;

    setActiveSentence(sentence);
    setIsSentenceDrawerOpen(true);
    setIsSentenceLoading(true);
    setSentenceData(null);
    setAiError(null);

    // Increment sentence analysis stat
    setStats((prev) => ({
      ...prev,
      sentencesAnalyzed: (prev.sentencesAnalyzed || 0) + 1,
    }));

    try {
      const data = await fetchSentenceAnalysis(sentence, currentArticle?.content);
      setSentenceData(data);
    } catch (err) {
      handleAiError(err, () => setIsSentenceDrawerOpen(false));
    } finally {
      setIsSentenceLoading(false);
    }
  };

  // Toggle Vocabulary handler
  const handleToggleVocab = (data: WordAnalysis, contextSentence: string) => {
    const exists = vocabList.some((w) => w.word.toLowerCase() === data.word.toLowerCase());

    if (exists) {
      setVocabList((prev) => prev.filter((w) => w.word.toLowerCase() !== data.word.toLowerCase()));
    } else {
      const newWord: VocabWord = {
        id: 'v-' + Date.now(),
        word: data.word,
        lemma: data.lemma || data.word,
        ipa: data.ipa || '',
        translation: data.translation,
        partOfSpeech: data.partOfSpeech,
        contextSentence: contextSentence || '',
        contextTense: data.contextTense,
        analysis: data,
        phoneticsGuide: data.phoneticsGuide,
        addedAt: formatDate(new Date()),
        repetitions: 0,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: formatDate(new Date()), // due immediately or tomorrow
        reviewHistory: [],
        tags: [currentArticle?.category || 'Reading'],
      };

      setVocabList((prev) => [newWord, ...prev]);
      // Keep the pronunciation with the word: fetch the clips in the background.
      void prefetchSpeech([data.word, contextSentence]);
    }
  };

  const handleUpdateWord = (updatedWord: VocabWord) => {
    setVocabList((prev) => prev.map((w) => (w.id === updatedWord.id ? updatedWord : w)));
  };

  const handleDeleteWord = (wordId: string) => {
    setVocabList((prev) => prev.filter((w) => w.id !== wordId));
  };

  const openArticle = (article: Article, focusText: string | null = null) => {
    setReaderFocus(focusText ? { articleId: article.id, text: focusText } : null);
    navigate({ name: 'reader', articleId: article.id });
  };

  // Add or edit. A new article opens straight away; an edit stays where it is.
  const handleSaveArticle = (article: Article) => {
    const exists = articles.some((a) => a.id === article.id);
    setArticles((prev) => (exists ? prev.map((a) => (a.id === article.id ? article : a)) : [article, ...prev]));
    if (!exists) openArticle(article);
  };

  const handleDeleteArticle = async (article: Article) => {
    // The article and its recordings go in one transaction; the list changes only once that committed.
    try {
      await deleteArticleData(article.id);
    } catch (err) {
      reportSave('articles', err);
      return;
    }
    setArticles((prev) => prev.filter((a) => a.id !== article.id));
    const here = parseRoute(window.location.hash).route;
    if (here.name === 'reader' && here.articleId === article.id) navigate(LIBRARY, { replace: true });
  };

  const missingSamples = SAMPLE_ARTICLES.filter((sample) => !articles.some((a) => a.id === sample.id));
  const handleRestoreSamples = () => setArticles((prev) => [...prev, ...missingSamples]);

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // Private mode: the guide will simply show again next time.
    }
    setOnboardingOpen(false);
  };

  const handleRecordAssessmentComplete = (assessment: PronunciationAssessment, sentenceText: string) => {
    setStats((prev) => {
      const newHistory = [
        ...(prev.pronunciationHistory || []),
        {
          date: formatDate(new Date()),
          text: sentenceText.slice(0, 45) + (sentenceText.length > 45 ? '...' : ''),
          score: assessment.overallScore,
        },
      ];

      const sum = newHistory.reduce((acc, h) => acc + h.score, 0);
      const avg = Math.round(sum / newHistory.length);

      return {
        ...prev,
        shadowingSessionsCompleted: (prev.shadowingSessionsCompleted || 0) + 1,
        averagePronunciationScore: avg,
        pronunciationHistory: newHistory,
      };
    });
  };

  const isCurrentWordInVocab = wordData
    ? vocabList.some((w) => w.word.toLowerCase() === wordData.word.toLowerCase())
    : false;

  const dueCount = vocabList.filter(isDueToday).length;

  // IndexedDB answers in a few milliseconds; render nothing until then so saved data never flashes as samples.
  // An older tab can hold the database open and block an upgrade; say so instead of waiting silently.
  if (!ready) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center p-6" aria-busy={dbNotice !== 'blocked'}>
        {dbNotice === 'blocked' && (
          <p role="alert" className="max-w-sm text-center text-sm text-ink-800">
            {t('storage.upgradeBlocked')}
          </p>
        )}
      </div>
    );
  }

  const practiceArticle = articles.find((a) => a.id === lastArticleId) ?? null;
  // The sidebar is a rail from md and expands from lg; the sections of Settings then list in it.
  const expanded = breakpoint === 'desktop' && sidebar.expanded;
  const sidebarWidth = breakpoint === 'phone' ? 0 : expanded ? 240 : 56;

  return (
    <div
      className="min-h-screen bg-ink-50 text-ink-900 flex flex-col font-sans"
      style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
    >
      <Header route={route} dueCount={dueCount} showMenu={breakpoint === 'phone'} />

      <div className="flex flex-1 items-start">
        {breakpoint !== 'phone' && (
          <Sidebar
            route={route}
            dueCount={dueCount}
            expanded={expanded}
            onToggle={breakpoint === 'desktop' ? sidebar.toggle : undefined}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {dbNotice === 'stale' && (
            <div role="alert" className="bg-bad-50 border-b border-bad-200 text-bad-900 text-sm">
              <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{t('storage.staleTab')}</span>
                <button
                  className="underline underline-offset-2 cursor-pointer"
                  onClick={() => window.location.reload()}
                >
                  {t('storage.reload')}
                </button>
              </div>
            </div>
          )}

          {failedSaves.length > 0 && (
            <div role="alert" className="bg-bad-50 border-b border-bad-200 text-bad-900 text-sm">
              <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{t('storage.saveFailed')}</span>
                <button
                  className="underline underline-offset-2 cursor-pointer"
                  onClick={() => navigate({ name: 'settings', section: 'data' })}
                >
                  {t('storage.openBackup')}
                </button>
              </div>
            </div>
          )}

          {!hasKey && !onboardingOpen && route.name !== 'settings' && (
            <div className="bg-accent-50 border-b border-accent-200 text-accent-900 text-sm">
              <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{t('keyBanner.text')}</span>
                <button className="font-medium underline underline-offset-2 cursor-pointer" onClick={requestKey}>
                  {t('keyBanner.action')}
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 pb-16">
            {route.name === 'library' && (
              <LibraryView
                articles={articles}
                missingSamples={missingSamples.length}
                onOpen={openArticle}
                onAdd={() => setEditor({ article: null })}
                onEdit={(article) => setEditor({ article })}
                onDelete={handleDeleteArticle}
                onRestoreSamples={handleRestoreSamples}
              />
            )}

            {route.name === 'reader' &&
              (currentArticle ? (
                <ReaderView
                  key={currentArticle.id}
                  currentArticle={currentArticle}
                  onBack={() => navigate(LIBRARY)}
                  onWordClick={handleWordClick}
                  onSentenceClick={handleSentenceClick}
                  onMissingKey={requestKey}
                  onOpenShadowingLog={(articleId) => {
                    setLogArticleId(articleId);
                    navigate({ name: 'study', tab: 'shadowing' });
                  }}
                  focusText={readerFocus?.text ?? null}
                  activeWord={activeWord}
                  activeSentence={activeSentence}
                />
              ) : (
                <NotFoundView reason="article" />
              ))}

            {route.name === 'study' && (
              <StudyView
                tab={route.tab}
                vocabulary={{ vocabList, onUpdateWord: handleUpdateWord, onDeleteWord: handleDeleteWord }}
                shadowing={{
                  articles,
                  initialArticleId: logArticleId,
                  onOpenSentence: (articleId, text) => {
                    const article = articles.find((a) => a.id === articleId);
                    if (article) openArticle(article, text);
                  },
                }}
              />
            )}

            {route.name === 'practice' && (
              <PracticeView
                currentArticle={practiceArticle}
                onNeedsKey={requestKey}
                onOpenLibrary={() => navigate(LIBRARY)}
                onRecordAssessmentComplete={handleRecordAssessmentComplete}
              />
            )}

            {route.name === 'progress' && <AnalyticsDashboard stats={stats} vocabList={vocabList} />}

            {route.name === 'settings' && (
              <SettingsPage
                section={route.section}
                sectionsInSidebar={expanded}
                keyRequest={keyRequest}
                onSettingsSaved={(newSettings) => setHasKey(hasTextKey(newSettings))}
                onReturn={(hash) => navigate(hash)}
              />
            )}

            {route.name === 'notFound' && <NotFoundView reason="page" />}
          </main>
        </div>
      </div>

      {/* Word Detail Floating Modal */}
      <WordDetailModal
        isOpen={isWordModalOpen}
        onClose={() => {
          setIsWordModalOpen(false);
          setActiveWord(null);
        }}
        wordData={wordData}
        isLoading={isWordLoading}
        contextSentence={activeWordSentence}
        isSavedInVocab={isCurrentWordInVocab}
        onToggleVocab={handleToggleVocab}
        onRetry={handleRetryWord}
        activeWord={activeWord}
        errorMessage={aiError}
      />

      {/* Sentence Breakdown & Shadowing Drawer */}
      <SentenceDrawer
        isOpen={isSentenceDrawerOpen}
        onClose={() => {
          setIsSentenceDrawerOpen(false);
          setActiveSentence(null);
        }}
        sentenceData={sentenceData}
        isLoading={isSentenceLoading}
        errorMessage={aiError}
        onRecordAssessmentComplete={handleRecordAssessmentComplete}
      />

      {/* Article Importer / Pasting Modal */}
      {editor && (
        <ArticleEditorDialog
          key={editor.article?.id ?? 'new'}
          article={editor.article}
          onClose={() => setEditor(null)}
          onSave={handleSaveArticle}
        />
      )}

      {onboardingOpen && (
        <OnboardingDialog
          onClose={finishOnboarding}
          onKeySaved={() => setHasKey(true)}
          onOpenSample={articles[0] ? () => openArticle(articles[0]) : undefined}
        />
      )}
    </div>
  );
}
