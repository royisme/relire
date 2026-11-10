/**
 * Settings as a page. It holds the unsaved edits, so moving between sections and AI purposes keeps them
 * until the learner leaves Settings; each section saves on its own, the AI purposes together.
 * Where the section list lives depends on the screen: in the sidebar (expanded, `lg` up), beside the
 * section (`md` up), or as the page itself (phones).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useImportGuard } from '../../hooks/useImportGuard';
import type { VocabularyModel } from '../../hooks/useVocabulary';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { navigate } from '../../hooks/useRoute';
import { getPromptOverrides, type PromptOverrides } from '../../services/ai/prompts';
import { getAppSettings, type AppSettings } from '../../utils/appSettings';
import { parseRoute, SETTINGS_SECTIONS, type AiPurposeRoute, type SettingsSection } from '../../utils/routes';
import { Link } from '../shell/Link';
import { Button } from '../ui/button';
import { Dialog, OverlayHeader } from '../ui/overlay';
import { PageHeader } from '../ui/page-header';
import { AiSection } from './AiSection';
import { DataSection } from './DataSection';
import type { KeyRequest } from './keyRequest';
import { PracticeSection } from './PracticeSection';
import { PromptsSection } from './PromptsSection';
import { SectionList } from './SectionList';
import { ServiceSection } from './ServiceSection';
import { sliceOf, withSlice, type SettingsSlice } from './slices';
import { useModelCatalogue } from './useModelCatalogue';
import { WordsSection, draftAfterSave } from './WordsSection';

/** Settings links keep an unsaved AI draft (the page stays mounted); anything else asks first. */
const isSettingsLink = (href: string) => parseRoute(href).route.name === 'settings';

interface SettingsPageProps {
  /** null is the section list (phones); wider screens resolve it to the first section. */
  section: SettingsSection | null;
  /** The AI page's current purpose; only meaningful while section is `ai`. */
  purpose: AiPurposeRoute;
  /** The sidebar already lists the sections, so the page does not repeat them. */
  sectionsInSidebar: boolean;
  /** The app's one committed vocabulary model; the Words section saves its preference through it. */
  vocabulary: VocabularyModel;
  keyRequest: KeyRequest | null;
  onSettingsSaved: (settings: AppSettings) => void;
  onReturn: (hash: string) => void;
}

export function SettingsPage({
  section,
  purpose,
  sectionsInSidebar,
  vocabulary,
  keyRequest,
  onSettingsSaved,
  onReturn,
}: SettingsPageProps) {
  const { t } = useTranslation();
  const wide = useMediaQuery('(min-width: 768px)');
  const [saved, setSaved] = useState<AppSettings>(getAppSettings);
  const [draft, setDraft] = useState<AppSettings>(saved);
  const [savedPrompts, setSavedPrompts] = useState<PromptOverrides>(getPromptOverrides);
  const [promptDrafts, setPromptDrafts] = useState<PromptOverrides>(savedPrompts);
  // Both Words drafts survive section switches and are gone once Settings is left.
  // A save clears it only while it still holds the text that save submitted.
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<string | null>(null);
  // A key request focuses the field once (the id changes per request); switching purpose must not pull focus back.
  const keyInput = useRef<HTMLInputElement>(null);
  const focusRequest = keyRequest?.id ?? null;
  useEffect(() => {
    if (focusRequest !== null) keyInput.current?.focus();
  }, [focusRequest]);

  // Discovery survives a purpose switch while the provider and key stay the same; it is never stored.
  const catalogue = useModelCatalogue(draft, purpose);
  const aiDirty = sliceOf(draft, 'ai') !== sliceOf(saved, 'ai');
  const guard = useImportGuard(
    aiDirty,
    false,
    () => setDraft((current) => withSlice(current, saved, 'ai')),
    isSettingsLink,
  );

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
          {active === 'ai' && (
            <AiSection
              key={purpose}
              purpose={purpose}
              catalogue={catalogue}
              keyInput={keyInput}
              draft={draft}
              saved={saved}
              onChange={setDraft}
              onSaved={(next) => commit(next, 'ai')}
              keyRequest={keyRequest}
              onReturn={onReturn}
            />
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
          {active === 'words' && (
            <WordsSection
              model={vocabulary}
              draft={{
                value: limitDraft,
                retention: retentionDraft,
                onChange: setLimitDraft,
                onRetentionChange: setRetentionDraft,
                onSaved: (submitted) => {
                  setLimitDraft((current) => draftAfterSave(current, submitted.newPerDay));
                  setRetentionDraft((current) => draftAfterSave(current, submitted.retentionPercent));
                },
              }}
            />
          )}
          {active === 'data' && <DataSection />}
          {active === 'service' && (
            <ServiceSection
              draft={draft}
              saved={saved}
              onChange={setDraft}
              onSaved={(next) => commit(next, 'service')}
            />
          )}
        </div>
      </div>
      {guard.leaving && (
        <Dialog label={t('settings.leaveTitle')} onClose={() => guard.decide(false)} className="max-w-sm">
          <OverlayHeader
            title={t('settings.leaveTitle')}
            closeLabel={t('common.close')}
            onClose={() => guard.decide(false)}
          />
          <div className="p-5 space-y-4">
            <p className="text-sm">{t('settings.leaveHelp')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => guard.decide(false)}>
                {t('settings.keepEditing')}
              </Button>
              <Button onClick={() => guard.decide(true)}>{t('settings.discard')}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
