/**
 * My study: Words, Shadowing, Mistakes and Grammar. The route carries the tab. The Conjugation page (Grammar) is
 * loaded on demand, with its engine and verification code, so the main bundle does not carry it.
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { STUDY_TABS, type StudyTab } from '../../utils/routes';
import { VocabularyView } from '../VocabularyView';
import { Link } from '../shell/Link';
import { MistakeNotebook } from './MistakeNotebook';
import { ShadowingLog } from './ShadowingLog';

const ConjugationPage = lazy(() =>
  import('./grammar/ConjugationPage').then((module) => ({ default: module.ConjugationPage })),
);

interface Props {
  tab: StudyTab;
  /** The Conjugation page's `?verb=` prefill. */
  verb?: string;
  sectionsInSidebar: boolean;
  vocabulary: ComponentProps<typeof VocabularyView>;
  shadowing: ComponentProps<typeof ShadowingLog>;
  mistakes: ComponentProps<typeof MistakeNotebook>;
}

export function StudyView({ tab, verb, sectionsInSidebar, vocabulary, shadowing, mistakes }: Props) {
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
          {tab === 'mistakes' ? (
            <MistakeNotebook {...mistakes} />
          ) : tab === 'grammar' ? (
            <Suspense fallback={<div aria-busy="true" className="min-h-96" />}>
              <ConjugationPage key={verb ?? ''} initialVerb={verb} />
            </Suspense>
          ) : (
            <ShadowingLog {...shadowing} />
          )}
        </div>
      )}
    </div>
  );
}
