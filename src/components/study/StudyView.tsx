/**
 * My study: the route chooses the tab and Grammar section. Grammar screens load on demand.
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { GrammarTag } from '../../types/grammar';
import { STUDY_TABS, type StudyTab } from '../../utils/routes';
import { VocabularyView } from '../VocabularyView';
import { Link } from '../shell/Link';
import { MistakeNotebook } from './MistakeNotebook';
import { ShadowingLog } from './ShadowingLog';

const GrammarSection = lazy(() => import('./grammar/GrammarSection'));

interface Props {
  tab: StudyTab;
  /** The Conjugation page's `?verb=` prefill. */
  verb?: string;
  section?: 'conjugation' | 'gender';
  tag?: GrammarTag;
  sectionsInSidebar: boolean;
  vocabulary: ComponentProps<typeof VocabularyView>;
  shadowing: ComponentProps<typeof ShadowingLog>;
  mistakes: ComponentProps<typeof MistakeNotebook>;
}

export function StudyView({ tab, section, verb, tag, sectionsInSidebar, vocabulary, shadowing, mistakes }: Props) {
  const { t } = useTranslation();
  return (
    <div>
      {!sectionsInSidebar && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
          <nav aria-label={t('study.label')} className="max-w-full overflow-x-auto">
            <div className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-1 sm:inline-flex">
              {STUDY_TABS.map((section) => (
                <Link
                  key={section}
                  to={{ name: 'study', tab: section }}
                  aria-current={section === tab ? 'page' : undefined}
                  // Below sm the four tabs share the width equally in a smaller label, so none is clipped in either language.
                  className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-md px-1 text-xs whitespace-nowrap cursor-pointer transition-colors sm:flex-none sm:px-3 sm:text-sm ${
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
        <div className="max-w-5xl min-w-0 mx-auto px-4 sm:px-6 py-6">
          {tab === 'mistakes' ? (
            <MistakeNotebook {...mistakes} />
          ) : tab === 'grammar' ? (
            <Suspense fallback={<div aria-busy="true" className="h-[36rem]" />}>
              <GrammarSection section={section} verb={verb} tag={tag} />
            </Suspense>
          ) : tab === 'shadowing' ? (
            <ShadowingLog {...shadowing} />
          ) : null}
        </div>
      )}
    </div>
  );
}
