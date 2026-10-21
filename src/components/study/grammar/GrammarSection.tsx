/** Owns Grammar section navigation and lazy screens; topic loading stays in TopicsPage. */
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../../hooks/useRoute';
import { contentServiceUrl } from '../../../services/grammarTopics/service';
import type { GrammarTag } from '../../../types/grammar';
import { Segmented } from '../../ui/segmented';

const TopicsPage = lazy(() => import('./TopicsPage'));
const GenderPage = lazy(() => import('./GenderPage'));
const ConjugationPage = lazy(() => import('./ConjugationPage').then((module) => ({ default: module.ConjugationPage })));

export default function GrammarSection({
  section,
  verb,
  tag,
  topicId,
}: {
  section?: 'conjugation' | 'gender';
  verb?: string;
  tag?: GrammarTag;
  topicId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-5">
      <Segmented
        label={t('grammarTopics.sections')}
        value={section ?? (contentServiceUrl() ? 'topics' : 'conjugation')}
        options={[
          ...(contentServiceUrl() ? [{ value: 'topics' as const, label: t('grammarTopics.title') }] : []),
          { value: 'conjugation', label: t('conjugation.page.title') },
          { value: 'gender', label: t('nounGender.title') },
        ]}
        onChange={(value) =>
          navigate({ name: 'study', tab: 'grammar', ...(value !== 'topics' ? { section: value } : {}) })
        }
      />
      <Suspense fallback={<div aria-busy="true" className="h-[32rem]" />}>
        {section === 'gender' ? (
          <GenderPage />
        ) : section === 'conjugation' || !contentServiceUrl() ? (
          <ConjugationPage key={verb ?? ''} initialVerb={verb} />
        ) : (
          <TopicsPage key={topicId ?? ''} topicId={topicId} tag={tag} />
        )}
      </Suspense>
    </div>
  );
}
