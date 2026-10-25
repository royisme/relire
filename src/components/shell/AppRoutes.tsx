/** Owns the route-to-page switch: which page each route shows, with its learning strip, lazy boundary and reader branches. Not app data, lookup state or the page frame. */
import { Suspense, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { retryableLazy } from '../../utils/retryableLazy';
import { NotFoundView } from './NotFoundView';
import { LearningNavigation } from './LearningNavigation';
import { ReaderView } from '../ReaderView';
import { StudyView } from '../study/StudyView';
import { UnitView } from '../practice/UnitView';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { ImportArticlePage } from '../import/ImportArticlePage';
import { ImportExercisesPage } from '../import/ImportExercisesPage';
import { LibraryView } from '../LibraryView';
import { SettingsPage } from '../settings/SettingsPage';
import { AboutSection } from '../settings/AboutSection';
import type { KeyRequest } from '../settings/keyRequest';
import { SpeakingPage } from '../practice/SpeakingPage';
import { TodayPage } from '../today/TodayPage';
import type { Article, UserStats } from '../../types';
import type { AppSettings } from '../../utils/appSettings';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import type { useArticleLibrary } from '../../hooks/useArticleLibrary';
import type { useReaderLookup } from '../../hooks/useReaderLookup';
import { navigate } from '../../hooks/useRoute';
import { readerIdentity } from '../../types/readerSource';
import { sourceOfRecording } from '../../storage/shadowing';
import { LIBRARY, vocabularyPlaceOf, type AiPurposeRoute, type Route } from '../../utils/routes';

const PracticePage = retryableLazy(async () => ({
  default: (await import('../practice/PracticePage')).PracticePage,
}));
const PracticeSetPage = retryableLazy(async () => ({
  default: (await import('../practice/PracticeSetPage')).PracticeSetPage,
}));
const GrammarSection = retryableLazy(() => import('../study/grammar/GrammarSection'));
const GradedReadersPage = retryableLazy(async () => ({
  default: (await import('../graded/GradedReadersPage')).GradedReadersPage,
}));
const GradedReaderPage = retryableLazy(async () => ({
  default: (await import('../graded/GradedReaderPage')).GradedReaderPage,
}));

interface AppRoutesProps {
  route: Route;
  articles: Article[];
  setArticles: Dispatch<SetStateAction<Article[]>>;
  stats: UserStats;
  vocabulary: VocabularyModel;
  library: ReturnType<typeof useArticleLibrary>;
  reader: ReturnType<typeof useReaderLookup>;
  /** Sections of Settings and Study list in the sidebar, so the page skips its own links. */
  expanded: boolean;
  requestKey: (purpose?: AiPurposeRoute) => void;
  /** The source the shadowing log opens at, and how the reader sets it. */
  logSourceId: string | null;
  setLogSourceId: (sourceId: string | null) => void;
  keyRequest: KeyRequest | null;
  onSettingsSaved: (settings: AppSettings) => void;
}

export function AppRoutes({
  route,
  articles,
  setArticles,
  stats,
  vocabulary,
  library,
  reader,
  expanded,
  requestKey,
  logSourceId,
  setLogSourceId,
  keyRequest,
  onSettingsSaved,
}: AppRoutesProps) {
  const { t } = useTranslation();
  const {
    readerDocument,
    readerSource,
    passageUnit,
    readerUnits,
    activeWord,
    activeSentence,
    handleWordClick,
    handleSentenceClick,
    handleRecordAssessmentComplete,
  } = reader;

  return (
    <>
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
          missingSamples={library.missingSamples.length}
          onOpen={library.openArticle}
          onAdd={() => library.setEditor({ article: null })}
          onEdit={(article) => library.setEditor({ article })}
          onDelete={library.handleDeleteArticle}
          onRestoreSamples={library.handleRestoreSamples}
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

      {(route.name === 'study' || route.name.startsWith('words')) && (
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
            place: vocabularyPlaceOf(route),
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
        <AnalyticsDashboard stats={stats} vocabList={vocabulary.rows} onMissingKey={requestKey} />
      )}

      {route.name === 'settings' && (
        <SettingsPage
          section={route.section}
          purpose={route.purpose ?? 'text'}
          sectionsInSidebar={expanded}
          vocabulary={vocabulary}
          keyRequest={keyRequest ?? (route.focusKey ? { id: 0, returnTo: route.returnTo ?? null } : null)}
          onSettingsSaved={onSettingsSaved}
          onReturn={(hash) => navigate(hash)}
        />
      )}

      {route.name === 'about' && <AboutSection />}
      {route.name === 'notFound' && <NotFoundView reason="page" />}
    </>
  );
}
