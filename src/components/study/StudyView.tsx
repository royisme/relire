/** My study: Words, Shadowing and Mistakes. The route carries the tab. */
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { STUDY_TABS, type StudyTab } from '../../utils/routes';
import { VocabularyView } from '../VocabularyView';
import { Link } from '../shell/Link';
import { MistakeNotebook } from './MistakeNotebook';
import { ShadowingLog } from './ShadowingLog';

interface Props {
  tab: StudyTab;
  sectionsInSidebar: boolean;
  vocabulary: ComponentProps<typeof VocabularyView>;
  shadowing: ComponentProps<typeof ShadowingLog>;
  mistakes: ComponentProps<typeof MistakeNotebook>;
}

export function StudyView({ tab, sectionsInSidebar, vocabulary, shadowing, mistakes }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      {!sectionsInSidebar && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
          <nav aria-label={t('study.label')} className="max-w-full overflow-x-auto">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-ink-100 p-1">
              {STUDY_TABS.map((section) => (
                <Link
                  key={section}
                  to={{ name: 'study', tab: section }}
                  aria-current={section === tab ? 'page' : undefined}
                  className={`inline-flex h-10 items-center px-3 rounded-md text-sm whitespace-nowrap cursor-pointer transition-colors ${
                    section === tab ? 'bg-surface text-ink-950 font-medium' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  {t(`study.${section}`)}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}
      {tab === 'words' ? (
        <VocabularyView {...vocabulary} />
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {tab === 'mistakes' ? <MistakeNotebook {...mistakes} /> : <ShadowingLog {...shadowing} />}
        </div>
      )}
    </div>
  );
}
