/**
 * Settings as a page. It holds the unsaved edits, so moving between sections keeps them until the
 * learner leaves Settings; every section saves on its own. Where the section list lives depends on
 * the screen: in the sidebar (expanded, `lg` up), beside the section (`md` up), or as the page itself (phones).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { navigate } from '../../hooks/useRoute';
import { getPromptOverrides, type PromptOverrides } from '../../services/ai/prompts';
import { getAppSettings, type AppSettings } from '../../utils/appSettings';
import { SETTINGS_SECTIONS, type SettingsSection } from '../../utils/routes';
import { Link } from '../shell/Link';
import { PageHeader } from '../ui/page-header';
import { AboutSection } from './AboutSection';
import { DataSection } from './DataSection';
import type { KeyRequest } from './keyRequest';
import { PracticeSection } from './PracticeSection';
import { PromptsSection } from './PromptsSection';
import { SectionList } from './SectionList';
import { withSlice, type SettingsSlice } from './slices';
import { SpeechSection } from './SpeechSection';
import { TextAiSection } from './TextAiSection';

interface SettingsPageProps {
  /** null is the section list (phones); wider screens resolve it to the first section. */
  section: SettingsSection | null;
  /** The sidebar already lists the sections, so the page does not repeat them. */
  sectionsInSidebar: boolean;
  keyRequest: KeyRequest | null;
  onSettingsSaved: (settings: AppSettings) => void;
  onReturn: (hash: string) => void;
}

export function SettingsPage({ section, sectionsInSidebar, keyRequest, onSettingsSaved, onReturn }: SettingsPageProps) {
  const { t } = useTranslation();
  const wide = useMediaQuery('(min-width: 768px)');
  const [saved, setSaved] = useState<AppSettings>(getAppSettings);
  const [draft, setDraft] = useState<AppSettings>(saved);
  const [savedPrompts, setSavedPrompts] = useState<PromptOverrides>(getPromptOverrides);
  const [promptDrafts, setPromptDrafts] = useState<PromptOverrides>(savedPrompts);

  // The bare address is the list on phones; with room for a section it opens the first one instead.
  useEffect(() => {
    if (wide && section === null) navigate({ name: 'settings', section: SETTINGS_SECTIONS[0] }, { replace: true });
  }, [wide, section]);

  const commit = (next: AppSettings, slice: SettingsSlice) => {
    setSaved(next);
    setDraft((current) => withSlice(current, next, slice));
    onSettingsSaved(next);
  };

  if (!wide && section === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <SectionList current={null} variant="page" />
      </div>
    );
  }

  const active = section ?? SETTINGS_SECTIONS[0];
  const column = wide && !sectionsInSidebar;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
      {!wide && (
        <Link
          to={{ name: 'settings', section: null }}
          className="-ml-2 mb-3 inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          {t('settings.title')}
        </Link>
      )}
      <div className={column ? 'grid grid-cols-[11rem_minmax(0,1fr)] gap-8' : undefined}>
        {column && <SectionList current={active} variant="column" />}
        <div className="min-w-0 max-w-2xl space-y-6">
          <PageHeader title={t(`settings.sections.${active}.title`)} subtitle={t(`settings.sections.${active}.desc`)} />
          {active === 'text-ai' && (
            <TextAiSection
              draft={draft}
              saved={saved}
              onChange={setDraft}
              onSaved={(next) => commit(next, 'text')}
              keyRequest={keyRequest}
              onReturn={onReturn}
            />
          )}
          {active === 'speech' && (
            <SpeechSection draft={draft} saved={saved} onChange={setDraft} onSaved={(next) => commit(next, 'speech')} />
          )}
          {active === 'practice' && (
            <PracticeSection
              draft={draft}
              saved={saved}
              onChange={setDraft}
              onSaved={(next) => commit(next, 'practice')}
            />
          )}
          {active === 'prompts' && (
            <PromptsSection
              drafts={promptDrafts}
              saved={savedPrompts}
              onChange={setPromptDrafts}
              onSaved={(stored) => {
                setSavedPrompts(stored);
                setPromptDrafts(stored);
              }}
            />
          )}
          {active === 'data' && <DataSection />}
          {active === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
