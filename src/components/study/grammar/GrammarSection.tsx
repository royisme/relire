/** Owns Grammar section navigation and lazy screens; topic loading stays in TopicsPage. */
import { lazy, Suspense } from 'react';
import { contentServiceUrl } from '../../../services/grammarTopics/service';
import type { VocabularyWordLookup } from '../../../services/vocabulary/identity';
import type { GrammarTag } from '../../../types/grammar';

const TopicsPage = lazy(() => import('./TopicsPage'));
const GenderPage = lazy(() => import('./GenderPage'));
const ConjugationPage = lazy(() => import('./ConjugationPage').then((module) => ({ default: module.ConjugationPage })));

export default function GrammarSection({
  section,
  verb,
  tag,
  topicId,
  onWord,
  onMissingKey,
}: {
  section?: 'conjugation' | 'gender';
  verb?: string;
  tag?: GrammarTag;
  topicId?: string;
  onWord: VocabularyWordLookup;
  onMissingKey: () => void;
}) {
  return (
    <div className="min-w-0 space-y-5">
      <Suspense fallback={<div aria-busy="true" className="h-[32rem]" />}>
        {section === 'gender' ? (
          <GenderPage />
        ) : section === 'conjugation' || !contentServiceUrl() ? (
          <ConjugationPage key={verb ?? ''} initialVerb={verb} onWord={onWord} onMissingKey={onMissingKey} />
        ) : (
          <TopicsPage key={topicId ?? ''} topicId={topicId} tag={tag} />
        )}
      </Suspense>
    </div>
  );
}
