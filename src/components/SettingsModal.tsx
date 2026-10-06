import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, OverlayHeader } from './ui/overlay';
import { AiSection } from './settings/AiSection';
import { PromptsSection } from './settings/PromptsSection';
import { DataSection } from './settings/DataSection';
import { type AppSettings, getAppSettings, saveAppSettings } from '../utils/appSettings';
import { getPromptOverrides, savePromptOverrides, type PromptOverrides } from '../services/ai/prompts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: AppSettings) => void;
  /** Shown when the dialog was opened because an AI feature needs a key. */
  needsKey?: boolean;
}

/** The settings dialog: a shell that holds the unsaved edits; each section lives in ./settings. */
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSettingsSaved, needsKey }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());
  const [promptDrafts, setPromptDrafts] = useState<PromptOverrides>(getPromptOverrides());

  useEffect(() => {
    if (isOpen) {
      setSettings(getAppSettings());
      setPromptDrafts(getPromptOverrides());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updated = saveAppSettings(settings);
    savePromptOverrides(promptDrafts);
    onSettingsSaved?.(updated);
    onClose();
  };

  return (
    <Dialog onClose={onClose} label={t('settings.title')}>
      <OverlayHeader title={t('settings.title')} subtitle={t('settings.subtitle')} onClose={onClose} closeLabel={t('common.close')} />

      <div className="p-5 sm:p-6 space-y-8 max-h-[72vh] overflow-y-auto">
        <AiSection settings={settings} onChange={setSettings} needsKey={needsKey} />
        <PromptsSection drafts={promptDrafts} onChange={setPromptDrafts} />
        <DataSection />
      </div>

      <div className="px-4 py-3 bg-surface border-t border-ink-200 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-500">{t('settings.savedNotice')}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </div>
      </div>
    </Dialog>
  );
};
