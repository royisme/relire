/** My study contains learner-owned Mistakes and saved Shadowing only. */
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { STUDY_TABS, type StudyTab } from '../../utils/routes';
import { Link } from '../shell/Link';
import { MistakeNotebook } from './MistakeNotebook';
import { ShadowingLog } from './ShadowingLog';

interface Props {
  tab: StudyTab;
  sectionsInSidebar: boolean;
  shadowing: ComponentProps<typeof ShadowingLog>;
  mistakes: ComponentProps<typeof MistakeNotebook>;
}
export function StudyView({ tab, sectionsInSidebar, shadowing, mistakes }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      {!sectionsInSidebar && (
        <nav aria-label={t('study.label')} className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 pt-6 sm:px-6">
          {STUDY_TABS.map((section) => (
            <Link
              key={section}
              to={{ name: 'study', tab: section }}
              aria-current={section === tab ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 text-sm ${section === tab ? 'border-accent-700 text-accent-900' : 'border-transparent text-ink-600 hover:text-ink-900'}`}
            >
              {t(`study.${section}`)}
            </Link>
          ))}
        </nav>
      )}
      <div className="mx-auto min-w-0 max-w-5xl px-4 py-6 sm:px-6">
        {tab === 'mistakes' ? <MistakeNotebook {...mistakes} /> : <ShadowingLog {...shadowing} />}
      </div>
    </div>
  );
}
