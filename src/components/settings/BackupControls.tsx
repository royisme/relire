import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import { getAppSettings, saveAppSettings } from '../../utils/appSettings';
import { exportProtectedAudio, importAudio } from '../../storage/audio';
import { exportData, importData } from '../../storage/db';
import { getPromptOverrides, savePromptOverrides } from '../../services/ai/prompts';
import { errorMessage } from '../../services/ai/errors';
import { exportShadowing, parseShadowingBackup, shadowingRestored } from '../../storage/shadowing';

interface BackupControlsProps {
  /** Sizes for the "include" options, in bytes. */
  audioBytes: number;
  shadowingBytes: number;
}

/** Settings → Data and backup: export everything to one JSON file, or restore from one. API keys are never included. */
export const BackupControls: React.FC<BackupControlsProps> = ({ audioBytes, shadowingBytes }) => {
  const { t } = useTranslation();
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeShadowing, setIncludeShadowing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export everything into one JSON file. API keys are left out on purpose; prompt edits are included.
  const handleExportData = async () => {
    try {
      const { apiKeys: _keys, ...settingsWithoutKeys } = getAppSettings();
      const backupData = {
        version: '1.1',
        exportedAt: new Date().toISOString(),
        settings: settingsWithoutKeys,
        prompts: getPromptOverrides(),
        ...(await exportData()),
        ...(includeAudio ? { audio: await exportProtectedAudio() } : {}),
        ...(includeShadowing ? { shadowing: await exportShadowing() } : {}),
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relire-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupStatus(t('settings.exportSuccess'));
    } catch (err) {
      setBackupStatus(t('settings.exportFailed', { msg: errorMessage(err) }));
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        // Recordings are checked in full before anything is written: absent keeps the current ones,
        // [] clears them, anything malformed refuses the whole restore.
        const shadowing = data.shadowing === undefined ? undefined : parseShadowingBackup(data.shadowing);

        await importData({
          shadowing,
          articles: Array.isArray(data.articles) ? data.articles : undefined,
          vocab: Array.isArray(data.vocab) ? data.vocab : undefined,
          stats: data.stats && typeof data.stats === 'object' ? data.stats : undefined,
        });
        if (shadowing) shadowingRestored();
        const audioResult = Array.isArray(data.audio) ? await importAudio(data.audio) : { imported: 0, failed: 0 };
        if (data.prompts && typeof data.prompts === 'object') savePromptOverrides(data.prompts);
        if (data.settings && typeof data.settings === 'object') {
          // A backup never carries API keys, so keep the ones already saved.
          saveAppSettings({ ...data.settings, apiKeys: getAppSettings().apiKeys });
        }

        // Give a partial audio restore time to be read before the page reloads.
        setBackupStatus(
          audioResult.failed > 0
            ? t('settings.importAudioPartial', { failed: audioResult.failed })
            : t('settings.importSuccess'),
        );
        setTimeout(
          () => {
            window.location.reload();
          },
          audioResult.failed > 0 ? 5000 : 1200,
        );
      } catch (err) {
        setBackupStatus(t('settings.restoreFailed', { msg: errorMessage(err) }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-xs text-ink-700 cursor-pointer">
        <input
          type="checkbox"
          checked={includeAudio}
          onChange={(e) => setIncludeAudio(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent-700"
        />
        <span>
          {t('settings.backupAudio')}{' '}
          <span className="text-ink-500 tnum">
            {t('settings.backupAudioSize', { mb: ((audioBytes * 4) / 3 / 1024 / 1024).toFixed(1) })}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs text-ink-700 cursor-pointer">
        <input
          type="checkbox"
          checked={includeShadowing}
          onChange={(e) => setIncludeShadowing(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent-700"
        />
        <span>
          {t('settings.backupShadowing')}{' '}
          <span className="text-ink-500 tnum">
            {t('settings.backupAudioSize', { mb: ((shadowingBytes * 4) / 3 / 1024 / 1024).toFixed(1) })}
          </span>
        </span>
      </label>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <button
          type="button"
          onClick={handleExportData}
          className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-on-fill text-sm font-medium cursor-pointer"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{t('settings.exportBackup')}</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 h-10 px-4 rounded-md border border-ink-300 bg-surface hover:bg-ink-100 text-ink-800 text-sm cursor-pointer"
        >
          <Upload className="w-4 h-4" aria-hidden="true" />
          <span>{t('settings.importBackup')}</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportData}
          className="hidden"
        />
      </div>

      {backupStatus && (
        <div className="p-2.5 rounded-md bg-ink-50 border border-ink-200 text-xs font-medium text-ink-800">
          {backupStatus}
        </div>
      )}
    </div>
  );
};
