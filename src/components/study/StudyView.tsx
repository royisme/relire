/** My study: the learner's own material, Words (the vocabulary) and Shadowing (recordings). The route carries the tab. */
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../../hooks/useRoute';
import type { StudyTab } from '../../utils/routes';
import { VocabularyView } from '../VocabularyView';
import { Segmented } from '../ui/segmented';
import { ShadowingLog } from './ShadowingLog';

interface Props {
  tab: StudyTab;
  vocabulary: ComponentProps<typeof VocabularyView>;
  shadowing: ComponentProps<typeof ShadowingLog>;
}

export function StudyView({ tab, vocabulary, shadowing }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <Segmented
          label={t('study.label')}
          value={tab}
          onChange={(next) => navigate({ name: 'study', tab: next })}
          options={[
            { value: 'words', label: t('study.words') },
            { value: 'shadowing', label: t('study.shadowing') },
          ]}
        />
      </div>
      {tab === 'words' ? (
        <VocabularyView {...vocabulary} />
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <ShadowingLog {...shadowing} />
        </div>
      )}
    </div>
  );
}
