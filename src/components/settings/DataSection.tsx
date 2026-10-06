import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import { getApiKey, getAppSettings, saveAppSettings } from '../../utils/appSettings';
import { cacheCounts, clearCache } from '../../storage/cache';
import { audioStats, clearUnprotectedAudio, exportProtectedAudio, importAudio, type AudioStats } from '../../storage/audio';
import { exportData, getStorageInfo, importData, requestPersistence, type StorageInfo } from '../../storage/db';
import { getPromptOverrides, savePromptOverrides } from '../../services/ai/prompts';

/** Settings: what is stored on this device, backups, saved answers and audio. */
export const DataSection: React.FC = () => {
  const { t } = useTranslation();
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({});
  const [cacheInfo, setCacheInfo] = useState({ words: 0, sentences: 0, drills: 0 });
  const [audioInfo, setAudioInfo] = useState<AudioStats>({ clips: 0, bytes: 0, keptClips: 0, keptBytes: 0 });
  const [includeAudio, setIncludeAudio] = useState(false);
  const [localStats, setLocalStats] = useState({ articlesCount: 0, vocabCount: 0, statsHistoryCount: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    exportData()
      .then((d) =>
        setLocalStats({
          articlesCount: d.articles.length,
          vocabCount: d.vocab.length,
          statsHistoryCount: d.stats.pronunciationHistory?.length || 0,
        })
      )
      .catch((e) => console.error('Failed to read local stats', e));
    getStorageInfo().then(setStorageInfo);
    cacheCounts().then(setCacheInfo);
    audioStats().then(setAudioInfo);
  }, []);

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
    } catch (err: any) {
      setBackupStatus(t('settings.exportFailed', { msg: err.message || err }));
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        await importData({
          articles: Array.isArray(data.articles) ? data.articles : undefined,
          vocab: Array.isArray(data.vocab) ? data.vocab : undefined,
          stats: data.stats && typeof data.stats === 'object' ? data.stats : undefined,
        });
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
            : t('settings.importSuccess')
        );
        setTimeout(() => {
          window.location.reload();
        }, audioResult.failed > 0 ? 5000 : 1200);
      } catch (err: any) {
        setBackupStatus(t('settings.restoreFailed', { msg: err.message || err }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3.5">
      <h4 className="font-serif text-base font-semibold text-ink-900">{t('settings.offlineSection')}</h4>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs pb-2 border-b border-ink-200 flex-wrap gap-2">
          <span className="text-ink-600">{t('settings.offlineSummary')}</span>
          <span className="text-ink-800 tnum">
            {t('settings.articlesCount', { count: localStats.articlesCount })} · {t('settings.vocabCount', { count: localStats.vocabCount })} ·{' '}
            {t('settings.historyCount', { count: localStats.statsHistoryCount })}
          </span>
        </div>

        <p className="text-xs text-ink-500 leading-relaxed">
          {t('settings.offlineDesc')}
        </p>

        {/* Saved AI answers */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600">
            {t('settings.cacheSummary', { words: cacheInfo.words, sentences: cacheInfo.sentences, drills: cacheInfo.drills })}
          </span>
          <button
            type="button"
            disabled={cacheInfo.words + cacheInfo.sentences + cacheInfo.drills === 0}
            onClick={async () => {
              await clearCache();
              setCacheInfo(await cacheCounts());
              setStorageInfo(await getStorageInfo());
            }}
            className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {t('settings.clearCache')}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">{t('settings.cacheDesc')}</p>

        {/* Pronunciation audio */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600 tnum">
            {t('settings.audioSummary', {
              clips: audioInfo.clips,
              mb: (audioInfo.bytes / 1024 / 1024).toFixed(1),
              kept: audioInfo.keptClips,
            })}
          </span>
          <button
            type="button"
            disabled={audioInfo.clips === audioInfo.keptClips}
            onClick={async () => {
              await clearUnprotectedAudio();
              setAudioInfo(await audioStats());
              setStorageInfo(await getStorageInfo());
            }}
            className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {t('settings.clearAudio')}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">{t('settings.audioDesc')}</p>

        {/* Storage protection */}
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
          <span className="text-ink-600">
            {storageInfo.usage !== undefined && (
              <span className="tnum">{(storageInfo.usage / 1024 / 1024).toFixed(1)} MB · </span>
            )}
            {storageInfo.persisted ? t('settings.storageProtected') : t('settings.storageNotProtected')}
          </span>
          {storageInfo.persisted === false && (
            <button
              type="button"
              onClick={async () => {
                await requestPersistence();
                setStorageInfo(await getStorageInfo());
              }}
              className="h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium cursor-pointer"
            >
              {t('settings.protectStorage')}
            </button>
          )}
        </div>

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
              {t('settings.backupAudioSize', { mb: ((audioInfo.keptBytes * 4) / 3 / 1024 / 1024).toFixed(1) })}
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
    </div>
  );
};
