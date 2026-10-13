/** My study: the learner's own material, Words (the vocabulary) and Shadowing (recordings). */
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { VocabularyView } from '../VocabularyView';
import { Segmented } from '../ui/segmented';
import { ShadowingLog } from './ShadowingLog';

export type StudyTab = 'words' | 'shadowing';
const KEY = 'relire_study_tab';

export function readStudyTab(): StudyTab {
  try {
    return localStorage.getItem(KEY) === 'shadowing' ? 'shadowing' : 'words';
  } catch {
    return 'words';
  }
}

interface Props {
  tab: StudyTab;
  onTab: (tab: StudyTab) => void;
  vocabulary: ComponentProps<typeof VocabularyView>;
  shadowing: ComponentProps<typeof ShadowingLog>;
}

export function StudyView({ tab, onTab, vocabulary, shadowing }: Props) {
  const { t } = useTranslation();
  const choose = (next: StudyTab) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies in this tab.
    }
    onTab(next);
  };
  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        <Segmented
          label={t('study.label')}
          value={tab}
          onChange={choose}
          options={[{ value: 'words', label: t('study.words') }, { value: 'shadowing', label: t('study.shadowing') }]}
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
