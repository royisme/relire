/** Owns app startup, shared vocabulary/stats and route wiring; lookup sheets and library actions live in hooks. */
import React, { Suspense, useState, useEffect, type CSSProperties } from 'react';
import { retryableLazy } from './utils/retryableLazy';
import { PageContentBoundary } from './components/shell/PageContentBoundary';
import { useTranslation } from 'react-i18next';
import { Header } from './components/shell/Header';
import { Sidebar } from './components/shell/Sidebar';
import { NotFoundView } from './components/shell/NotFoundView';
import { ReaderView } from './components/ReaderView';
import { WordDetailModal } from './components/WordDetailModal';
import { SentenceDrawer } from './components/SentenceDrawer';
import { StudyView } from './components/study/StudyView';
import { UnitView } from './components/practice/UnitView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ArticleEditorDialog } from './components/ArticleEditorDialog';
import { ImportArticlePage } from './components/import/ImportArticlePage';
import { ImportExercisesPage } from './components/import/ImportExercisesPage';
import { LibraryView } from './components/LibraryView';
import { OnboardingDialog } from './components/OnboardingDialog';
import { SettingsPage } from './components/settings/SettingsPage';
import { AboutSection } from './components/settings/AboutSection';
import type { KeyRequest } from './components/settings/keyRequest';

import { Article, UserStats, PronunciationAssessment } from './types';
import { useVocabulary } from './hooks/useVocabulary';
import { useVocabularyBookmark } from './hooks/useVocabularyBookmark';
import { SAMPLE_ARTICLES } from './data/sampleArticles';
import { EMPTY_STATS, loadData, initializeData, saveStats } from './storage/db';
import { usePersist } from './storage/usePersist';
import { vocabularyDue, formatDate } from './utils/srs';
import { hasTextKey } from './utils/appSettings';
import { firstBundledReaderId } from './services/gradedReaders/firstReader';
import { LIBRARY, parseRoute, routeHref, worksWithoutKey, type AiPurposeRoute } from './utils/routes';
import { navigate, useRoute } from './hooks/useRoute';
import { useBreakpoint } from './hooks/useMediaQuery';
import { useSidebar } from './hooks/useSidebar';
import { useReaderUnits } from './hooks/useReaderUnits';
import { useLookupSheets } from './hooks/useLookupSheets';
import { useArticleLibrary } from './hooks/useArticleLibrary';
import { passageDocument, readerIdentity, type ReaderSource } from './types/readerSource';
import { sourceOfRecording } from './storage/shadowing';
import { setLabel } from './services/exercises/setLabel';
import { LearningNavigation } from './components/shell/LearningNavigation';
import { SpeakingPage } from './components/practice/SpeakingPage';
import { TodayPage } from './components/today/TodayPage';
const PracticePage = retryableLazy(async () => ({
  default: (await import('./components/practice/PracticePage')).PracticePage,
}));
const PracticeSetPage = retryableLazy(async () => ({
  default: (await import('./components/practice/PracticeSetPage')).PracticeSetPage,
}));
const GrammarSection = retryableLazy(() => import('./components/study/grammar/GrammarSection'));
const GradedReadersPage = retryableLazy(async () => ({
  default: (await import('./components/graded/GradedReadersPage')).GradedReadersPage,
}));
const GradedReaderPage = retryableLazy(async () => ({
  default: (await import('./components/graded/GradedReaderPage')).GradedReaderPage,
}));

const ONBOARDING_KEY = 'relire_onboarded';
/** The reader the guide opens: the first bundled one, or none while the app bundles no reader yet. */
const FIRST_READER_ID = firstBundledReaderId();
const storedFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export default function App() {
  const { t, i18n } = useTranslation();
  // Where the learner is: the address decides the screen (see utils/routes.ts).
  const route = useRoute();
  const breakpoint = useBreakpoint();
  const sidebar = useSidebar(
    route.name === 'reader' || route.name === 'passage' || route.name === 'gradedReader' || route.name === 'unit',
  );
  // The source the log opens at (set when the reader sends the learner to its recordings).
  const [logSourceId, setLogSourceId] = useState<string | null>(null);

  // Set while an AI feature is waiting for a key, so Settings can focus the field and offer the way back.
  const [keyRequest, setKeyRequest] = useState<KeyRequest | null>(null);
  // Articles and vocabulary commit before state changes; only stats use debounced persistence.
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failedSaves, setFailedSaves] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const reportSave = (name: string, error: unknown) => {
    if (error) console.error(`Saving ${name} failed`, error);
    setFailedSaves((prev) => (error ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));
  };
  const currentArticle = route.name === 'reader' ? (articles.find((a) => a.id === route.articleId) ?? null) : null;
  const readerUnits = useReaderUnits();
  const passageUnit = route.name === 'passage' ? readerUnits.units?.find((u) => u.id === route.unitId) : undefined;
  const readerDocument =
    currentArticle ??
    (passageUnit
      ? passageDocument(passageUnit, setLabel(t, passageUnit, i18n.resolvedLanguage), i18n.resolvedLanguage)
      : null);
  const readerSource: ReaderSource | null =
    route.name === 'reader'
      ? { kind: 'article', articleId: route.articleId }
      : route.name === 'passage'
        ? { kind: 'passage', unitId: route.unitId }
        : null;
  const lookupOwner = JSON.stringify([routeHref(route), readerDocument?.content]);
  const {
    editor,
    setEditor,
    openArticle,
    handleSaveArticle,
    handleDeleteArticle,
    missingSamples,
    handleRestoreSamples,
  } = useArticleLibrary(articles, setArticles, reportSave);
  const [hasKey, setHasKey] = useState(() => hasTextKey());
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const vocabulary = useVocabulary();
  const vocabList = vocabulary.rows;
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);

  // State that belongs to one place is dropped when the learner leaves it (adjusted while rendering, not in an effect).
  if (logSourceId && route.name !== 'study') setLogSourceId(null);
  if (keyRequest && route.name !== 'settings') setKeyRequest(null);

  useEffect(() => {
    let cancelled = false;
    void initializeData(SAMPLE_ARTICLES)
      .then(() => loadData())
      .then((data) => {
        if (cancelled || !data) return;
        setArticles(data.articles);
        setStats(data.stats);
        setReady(true);
        // First visit with no key: walk the user through setup.
        if (!storedFlag(ONBOARDING_KEY) && !hasTextKey()) setOnboardingOpen(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  usePersist('stats', stats, saveStats, ready, reportSave);

  // Settings → AI services, on the purpose that needs the key, with the key field ready; its way back is
  // wherever the learner is now. Lookups, generation and grading use the text purpose.
  const requestKey = (purpose: AiPurposeRoute = 'text') => {
    const here = window.location.hash || '#/today';
    const inSettings = parseRoute(window.location.hash).route.name === 'settings';
    setKeyRequest({ id: Date.now(), returnTo: inSettings ? null : here });
    navigate({ name: 'settings', section: 'ai', purpose, focusKey: true });
  };

  const {
    lookup,
    activeWord,
    activeSentence,
    wordData,
    handleWordClick,
    handleSentenceClick,
    wordSheet,
    sentenceSheet,
  } = useLookupSheets({ lookupOwner, content: readerDocument?.content, requestKey, setStats, t });

  const bookmark = useVocabularyBookmark(vocabulary, lookup, wordData ? { kind: 'ai', analysis: wordData } : null);

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

  const dueCount = vocabList.filter((row) => vocabularyDue(row.schedule, vocabulary.now)).length;

  // IndexedDB answers in a few milliseconds; render nothing until then so saved data never flashes as samples.
  if (!ready) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center p-6" aria-busy={!loadError}>
        {loadError ? (
          <div role="alert" className="max-w-sm text-center text-sm text-ink-800 space-y-3 break-words">
            <p>{t('storage.loadFailed', { msg: loadError })}</p>
            <button className="underline underline-offset-2 cursor-pointer" onClick={() => window.location.reload()}>
              {t('storage.reload')}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

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

          {!hasKey && !onboardingOpen && route.name !== 'settings' && !worksWithoutKey(route) && (
            <div className="bg-accent-50 border-b border-accent-200 text-accent-900 text-sm">
              <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{t('keyBanner.text')}</span>
                <button
                  className="font-medium underline underline-offset-2 cursor-pointer"
                  onClick={() => requestKey()}
                >
                  {t('keyBanner.action')}
                </button>
              </div>
            </div>
          )}

          <PageContentBoundary routeKey={routeHref(route)}>
            {route.name === 'today' && <TodayPage vocabulary={vocabulary} />}
            {route.name === 'importArticle' && (
              <ImportArticlePage onCreated={(article) => setArticles((prev) => [article, ...prev])} />
            )}
            {route.name === 'importExercises' && <ImportExercisesPage key={route.area} area={route.area} />}
            {(route.name === 'library' ||
              route.name === 'gradedReaders' ||
              route.name === 'grammar' ||
              route.name === 'grammarTopic' ||
              (route.name === 'practice' && (route.area === 'reading' || route.area === 'grammar'))) && (
              <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
                <LearningNavigation
                  area={
                    route.name === 'library' ||
                    route.name === 'gradedReaders' ||
                    (route.name === 'practice' && route.area === 'reading')
                      ? 'read'
                      : 'grammar'
                  }
                  current={route}
                />
              </div>
            )}
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

            {(route.name === 'gradedReaders' || route.name === 'gradedReader') && (
              <Suspense fallback={<div aria-busy="true" className="h-40" />}>
                {route.name === 'gradedReaders' ? (
                  <GradedReadersPage />
                ) : (
                  <GradedReaderPage
                    key={`${route.readerId}:${route.version ?? ''}`}
                    readerId={route.readerId}
                    version={route.version}
                    sentence={route.sentence}
                    vocabulary={vocabulary}
                    onOpenShadowingLog={(sourceId) => {
                      setLogSourceId(sourceId);
                      navigate({ name: 'study', tab: 'shadowing' });
                    }}
                  />
                )}
              </Suspense>
            )}

            {(route.name === 'reader' || route.name === 'passage') &&
              (readerDocument && readerSource ? (
                <ReaderView
                  key={readerIdentity(readerSource)}
                  readingDocument={readerDocument}
                  source={readerSource}
                  onBack={() =>
                    navigate(
                      readerSource.kind === 'passage' && passageUnit
                        ? { name: 'unit', area: passageUnit.learningArea, unitId: readerSource.unitId }
                        : LIBRARY,
                    )
                  }
                  onWordClick={handleWordClick}
                  onSentenceClick={handleSentenceClick}
                  onAssessed={handleRecordAssessmentComplete}
                  onMissingKey={requestKey}
                  onOpenShadowingLog={(sourceId) => {
                    setLogSourceId(sourceId);
                    navigate({ name: 'study', tab: 'shadowing' });
                  }}
                  focusText={route.sentence ?? null}
                  activeWord={activeWord}
                  activeSentence={activeSentence}
                />
              ) : route.name === 'passage' && !readerUnits.units && !readerUnits.error ? (
                <div className="min-h-40" aria-busy="true" />
              ) : (
                <>
                  <NotFoundView reason={route.name === 'passage' ? 'passage' : 'article'} />
                  {readerUnits.error && (
                    <p role="alert" className="px-4 text-sm text-bad-700 break-words">
                      {t('storage.loadFailed', { msg: readerUnits.error })}
                    </p>
                  )}
                </>
              ))}

            {(route.name === 'study' || route.name === 'wordsAll' || route.name === 'wordsReview') && (
              <StudyView
                tab={route.name === 'study' ? route.tab : 'words'}
                sectionsInSidebar={expanded}
                mistakes={{
                  onMissingKey: requestKey,
                  onWord: (word, sentence, context, source) => {
                    void handleWordClick(word, sentence, context, source);
                  },
                }}
                vocabulary={{
                  model: vocabulary,
                  place: route.name === 'wordsAll' ? 'all' : route.name === 'wordsReview' ? 'review' : 'today',
                }}
                shadowing={{
                  articles,
                  units: readerUnits.units,
                  unitsError: readerUnits.error,
                  initialSourceId: logSourceId,
                  onOpenSentence: (record) => {
                    const source = sourceOfRecording(record);
                    navigate(
                      source.kind === 'passage'
                        ? { name: 'passage', unitId: source.unitId, sentence: record.text }
                        : source.kind === 'graded'
                          ? {
                              name: 'gradedReader',
                              readerId: source.readerId,
                              version: source.version,
                              sentence: record.text,
                            }
                          : { name: 'reader', articleId: source.articleId, sentence: record.text },
                    );
                  },
                }}
              />
            )}

            {(route.name === 'grammar' || route.name === 'grammarTopic') && (
              <div className="max-w-5xl min-w-0 mx-auto px-4 sm:px-6 py-6">
                <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
                  <GrammarSection
                    topicId={route.name === 'grammarTopic' ? route.topicId : undefined}
                    section={route.name === 'grammar' ? route.section : undefined}
                    verb={route.name === 'grammar' ? route.verb : undefined}
                    tag={route.name === 'grammar' ? route.tag : undefined}
                    onWord={handleWordClick}
                    onMissingKey={requestKey}
                  />
                </Suspense>
              </div>
            )}

            {route.name === 'practice' && (
              <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
                <PracticePage key={route.area} area={route.area} articles={articles} onMissingKey={requestKey} />
              </Suspense>
            )}

            {route.name === 'practiceSet' && (
              <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
                <PracticeSetPage key={`${route.area}:${route.setId}`} area={route.area} setId={route.setId} />
              </Suspense>
            )}
            {route.name === 'unit' && (
              <UnitView
                key={`${route.area}:${route.unitId}`}
                area={route.area}
                unitId={route.unitId}
                onMissingKey={requestKey}
                onWord={handleWordClick}
              />
            )}

            {(route.name === 'speaking' || route.name === 'readAloud') && (
              <SpeakingPage
                key={route.name === 'readAloud' ? route.articleId : 'speaking'}
                articles={articles}
                workspace={route.name === 'readAloud'}
                articleId={route.name === 'readAloud' ? route.articleId : undefined}
                sentence={route.name === 'readAloud' ? route.sentence : undefined}
                onAssessed={handleRecordAssessmentComplete}
                onMissingKey={requestKey}
              />
            )}
            {route.name === 'progress' && (
              <AnalyticsDashboard stats={stats} vocabList={vocabList} onMissingKey={requestKey} />
            )}

            {route.name === 'settings' && (
              <SettingsPage
                section={route.section}
                purpose={route.purpose ?? 'text'}
                sectionsInSidebar={expanded}
                vocabulary={vocabulary}
                keyRequest={keyRequest ?? (route.focusKey ? { id: 0, returnTo: route.returnTo ?? null } : null)}
                onSettingsSaved={(newSettings) => setHasKey(hasTextKey(newSettings))}
                onReturn={(hash) => navigate(hash)}
              />
            )}

            {route.name === 'about' && <AboutSection />}

            {route.name === 'notFound' && <NotFoundView reason="page" />}
          </PageContentBoundary>
        </div>
      </div>

      {/* Word Detail Floating Modal */}
      <WordDetailModal {...wordSheet} bookmark={bookmark} />

      {/* Sentence breakdown drawer */}
      <SentenceDrawer {...sentenceSheet} />

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
          onOpenReader={
            FIRST_READER_ID ? () => navigate({ name: 'gradedReader', readerId: FIRST_READER_ID }) : undefined
          }
        />
      )}
    </div>
  );
}
