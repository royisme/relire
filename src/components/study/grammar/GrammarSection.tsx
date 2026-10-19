/** Owns Grammar section navigation and lazy screens; topic loading stays in TopicsPage. */
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../../hooks/useRoute';
import { contentServiceUrl } from '../../../services/grammarTopics/service';
import type { GrammarTag } from '../../../types/grammar';
import { Segmented } from '../../ui/segmented';

const TopicsPage = lazy(() => import('./TopicsPage'));
const ConjugationPage = lazy(() => import('./ConjugationPage').then((module) => ({ default: module.ConjugationPage })));

export default function GrammarSection({
  section,
  verb,
  tag,
  topicId,
}: {
  section?: 'conjugation';
  verb?: string;
  tag?: GrammarTag;
  topicId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-5">
      {contentServiceUrl() && (
        <Segmented
          label={t('grammarTopics.sections')}
          value={section ?? 'topics'}
          options={[
            { value: 'topics', label: t('grammarTopics.title') },
            { value: 'conjugation', label: t('conjugation.page.title') },
          ]}
          onChange={(value) =>
            navigate({ name: 'study', tab: 'grammar', ...(value === 'conjugation' ? { section: value } : {}) })
          }
        />
      )}
      <Suspense fallback={<div aria-busy="true" className="h-[32rem]" />}>
        {section === 'conjugation' || !contentServiceUrl() ? (
          <ConjugationPage key={verb ?? ''} initialVerb={verb} />
        ) : (
          <TopicsPage key={topicId ?? ''} topicId={topicId} tag={tag} />
        )}
      </Suspense>
    </div>
  );
}
