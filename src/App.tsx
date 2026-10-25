/** Owns app wiring: route, key request, onboarding and the pieces that must outlive a page; data, the frame and the pages live in their own files. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/shell/AppShell';
import { AppRoutes } from './components/shell/AppRoutes';
import { WordDetailModal } from './components/WordDetailModal';
import { SentenceDrawer } from './components/SentenceDrawer';
import { ArticleEditorDialog } from './components/ArticleEditorDialog';
import { OnboardingDialog } from './components/OnboardingDialog';
import type { KeyRequest } from './components/settings/keyRequest';
import { useVocabulary } from './hooks/useVocabulary';
import { useAppData } from './hooks/useAppData';
import { vocabularyDue } from './utils/srs';
import { hasTextKey } from './utils/appSettings';
import { firstBundledReaderId } from './services/gradedReaders/firstReader';
import { parseRoute, worksWithoutKey, type AiPurposeRoute } from './utils/routes';
import { navigate, useRoute } from './hooks/useRoute';
import { useBreakpoint } from './hooks/useMediaQuery';
import { useSidebar } from './hooks/useSidebar';
import { useReaderLookup } from './hooks/useReaderLookup';
import { useArticleLibrary } from './hooks/useArticleLibrary';

/** The reader the guide opens: the first bundled one, or none while the app bundles no reader yet. */
const FIRST_READER_ID = firstBundledReaderId();

export default function App() {
  const { t } = useTranslation();
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
  const {
    ready,
    loadError,
    failedSaves,
    articles,
    setArticles,
    stats,
    setStats,
    reportSave,
    onboardingOpen,
    finishOnboarding,
  } = useAppData();
  const library = useArticleLibrary(articles, setArticles, reportSave);
  const [hasKey, setHasKey] = useState(() => hasTextKey());
  const vocabulary = useVocabulary();

  // State that belongs to one place is dropped when the learner leaves it (adjusted while rendering, not in an effect).
  if (logSourceId && route.name !== 'study') setLogSourceId(null);
  if (keyRequest && route.name !== 'settings') setKeyRequest(null);

  // Settings → AI services, on the purpose that needs the key, with the key field ready; its way back is
  // wherever the learner is now. Lookups, generation and grading use the text purpose.
  const requestKey = (purpose: AiPurposeRoute = 'text') => {
    const here = window.location.hash || '#/today';
    const inSettings = parseRoute(window.location.hash).route.name === 'settings';
    setKeyRequest({ id: Date.now(), returnTo: inSettings ? null : here });
    navigate({ name: 'settings', section: 'ai', purpose, focusKey: true });
  };

  const reader = useReaderLookup(route, articles, vocabulary, requestKey, setStats);

  const dueCount = vocabulary.rows.filter((row) => vocabularyDue(row.schedule, vocabulary.now)).length;

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

  return (
    <AppShell
      route={route}
      dueCount={dueCount}
      breakpoint={breakpoint}
      expanded={expanded}
      onToggleSidebar={sidebar.toggle}
      saveFailed={failedSaves.length > 0}
      keyBanner={!hasKey && !onboardingOpen && route.name !== 'settings' && !worksWithoutKey(route)}
      onRequestKey={() => requestKey()}
      overlays={
        <>
          <WordDetailModal {...reader.wordSheet} bookmark={reader.bookmark} />
          <SentenceDrawer {...reader.sentenceSheet} />
          {library.editor && (
            <ArticleEditorDialog
              key={library.editor.article?.id ?? 'new'}
              article={library.editor.article}
              onClose={() => library.setEditor(null)}
              onSave={library.handleSaveArticle}
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
        </>
      }
    >
      <AppRoutes
        route={route}
        articles={articles}
        setArticles={setArticles}
        stats={stats}
        vocabulary={vocabulary}
        library={library}
        reader={reader}
        expanded={expanded}
        requestKey={requestKey}
        logSourceId={logSourceId}
        setLogSourceId={setLogSourceId}
        keyRequest={keyRequest}
        onSettingsSaved={(newSettings) => setHasKey(hasTextKey(newSettings))}
      />
    </AppShell>
  );
}
