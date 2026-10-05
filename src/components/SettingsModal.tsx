import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import {
  X, Settings, Key, Cpu, Volume2, ShieldCheck, CheckCircle2,
  AlertCircle, HelpCircle, RefreshCw, Sparkles,
  Download, Upload, Database, HardDrive, Trash2
} from 'lucide-react';
import {
  AppSettings, getAppSettings, saveAppSettings,
  AVAILABLE_ANALYSIS_MODELS, AVAILABLE_TTS_MODELS, AVAILABLE_VOICES
} from '../utils/appSettings';
import { speakFrench } from '../utils/frenchSpeech';
import { synthesizeSpeech } from '../services/gemini';
import { cacheCounts, clearCache } from '../storage/cache';
import { audioStats, clearUnprotectedAudio, exportProtectedAudio, importAudio, type AudioStats } from '../storage/audio';
import { exportData, getStorageInfo, importData, requestPersistence, type StorageInfo } from '../storage/db';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: AppSettings) => void;
  /** Shown when the dialog was opened because an AI feature needs a key. */
  needsKey?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
  needsKey,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({});
  const [cacheInfo, setCacheInfo] = useState({ words: 0, sentences: 0, drills: 0 });
  const [audioInfo, setAudioInfo] = useState<AudioStats>({ clips: 0, bytes: 0, keptClips: 0, keptBytes: 0 });
  const [includeAudio, setIncludeAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats on local data storage
  const [localStats, setLocalStats] = useState({
    articlesCount: 0,
    vocabCount: 0,
    statsHistoryCount: 0,
  });

  useEffect(() => {
    if (isOpen) {
      setSettings(getAppSettings());
      setTestResult(null);
      setBackupStatus(null);

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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const updated = saveAppSettings(settings);
    if (onSettingsSaved) {
      onSettingsSaved(updated);
    }
    onClose();
  };

  // Export all application data into a single JSON file. The API key is left out on purpose.
  const handleExportData = async () => {
    try {
      const { customApiKey: _key, ...settingsWithoutKey } = getAppSettings();
      const backupData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        settings: settingsWithoutKey,
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

  // Import application data from JSON file
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
        if (Array.isArray(data.audio)) await importAudio(data.audio);
        if (data.settings && typeof data.settings === 'object') {
          // A backup never carries the API key, so keep the one already saved.
          saveAppSettings({ ...data.settings, customApiKey: getAppSettings().customApiKey });
          setSettings(getAppSettings());
        }

        setBackupStatus(t('settings.importSuccess'));
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        setBackupStatus(t('settings.restoreFailed', { msg: err.message || err }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await synthesizeSpeech(
        { text: 'Bonjour !', voice: settings.ttsVoice, model: settings.ttsModel },
        settings.customApiKey
      );

      setTestResult({
        success: true,
        msg: t('settings.testSuccess'),
      });

      speakFrench('Bonjour ! Bienvenue sur Relire.', {
        voice: settings.ttsVoice,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: t('settings.testFailed', { msg: err.message || err }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog onClose={onClose} label={t('settings.title')}>
        <OverlayHeader title={t('settings.title')} subtitle={t('settings.subtitle')} onClose={onClose} closeLabel={t('common.close')} />

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          {needsKey && (
            <p className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
              {t('settings.needsKeyNotice')}
            </p>
          )}

          {/* SECTION 1: LLM Key & Deployment */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-ink-600" />
                <span>{t('settings.apiKeySection')}</span>
              </h4>
              {settings.customApiKey.trim() ? (
                <span className="text-ok-800 bg-ok-50 border border-ok-200 flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('settings.keySet')}</span>
                </span>
              ) : (
                <span className="text-accent-800 bg-accent-50 border border-accent-200 flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{t('settings.keyMissing')}</span>
                </span>
              )}
            </div>

            <div className="p-4 rounded-lg bg-white border border-ink-200 space-y-3 ">
              <div>
                <label className="block text-xs font-semibold text-ink-800 mb-1">
                  {t('settings.customKeyLabel')}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={t('settings.customKeyPlaceholder')}
                    value={settings.customApiKey}
                    onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-md bg-ink-50 border border-ink-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-600 focus:bg-white"
                  />
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {t('settings.customKeyDesc')}
                </p>
              </div>

              <p className="text-xs text-ink-500 leading-relaxed">
                {t('settings.keyPrivacy')}{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-700 underline underline-offset-2 hover:text-accent-900"
                >
                  {t('settings.getKey')}
                </a>
              </p>
            </div>
          </div>

          {/* SECTION 2: Model Configuration */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-ink-600" />
              <span>{t('settings.modelsSection')}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Analysis & Grammar Model */}
              <div className="p-4 rounded-lg bg-white border border-ink-200 space-y-2.5 ">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                  <Sparkles className="w-4 h-4 text-ink-600" />
                  <span>{t('settings.analysisModelTitle')}</span>
                </div>
                <p className="text-xs text-ink-500">
                  {t('settings.analysisModelDesc')}
                </p>

                <select
                  value={settings.analysisModel}
                  onChange={(e) => setSettings({ ...settings, analysisModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-ink-50 border border-ink-300 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-600 cursor-pointer"
                >
                  {AVAILABLE_ANALYSIS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t(`models.${m.id.replace(/\./g, '_')}.name`)}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-accent-900 bg-accent-50 p-2 rounded-md border border-accent-200/60 leading-relaxed">
                  {t(`models.${settings.analysisModel.replace(/\./g, '_')}.desc`, { defaultValue: '' })}
                </p>
              </div>

              {/* TTS Speech Model */}
              <div className="p-4 rounded-lg bg-white border border-ink-200 space-y-2.5 ">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
                  <Volume2 className="w-4 h-4 text-ink-600" />
                  <span>{t('settings.ttsModelTitle')}</span>
                </div>
                <p className="text-xs text-ink-500">
                  {t('settings.ttsModelDesc')}
                </p>

                <select
                  value={settings.ttsModel}
                  onChange={(e) => setSettings({ ...settings, ttsModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-md bg-ink-50 border border-ink-300 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-600 cursor-pointer"
                >
                  {AVAILABLE_TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t(`models.${m.id.replace(/\./g, '_')}.name`)}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-ok-950 bg-ok-50 p-2 rounded-md border border-ok-200/60 leading-relaxed">
                  {t(`models.${settings.ttsModel.replace(/\./g, '_')}.desc`, { defaultValue: '' })}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: Default Voice Selection */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-ink-600" />
              <span>{t('settings.voiceSection')}</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {AVAILABLE_VOICES.map((v) => {
                const isSelected = settings.ttsVoice === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, ttsVoice: v.id as any })}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent-700 bg-accent-50/80 ring-2 ring-accent-700/20 '
                        : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-ink-900">{v.id}</span>
                      <span className="text-xs px-1.5 py-0.2 rounded-md bg-ink-100 text-ink-600">
                        {v.gender === 'female' ? t('settings.female') : t('settings.male')}
                      </span>
                    </div>
                    <span className="text-xs text-ink-500 block truncate">
                      {t(`voices.${v.id}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: Local Offline Data Persistence & Backup */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-ink-600" />
              <span>{t('settings.offlineSection')}</span>
            </h4>

            <div className="p-4 rounded-lg bg-white border border-ink-200 space-y-3 ">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-ink-100 flex-wrap gap-2">
                <span className="text-ink-600">{t('settings.offlineSummary')}</span>
                <div className="flex items-center gap-2 sm:gap-3 font-medium text-ink-800 flex-wrap">
                  <span className="bg-ink-100 px-2 py-0.5 rounded-md text-xs">
                    <strong>{localStats.articlesCount}</strong> {t('settings.articlesCount', { count: '' })}
                  </span>
                  <span className="bg-ink-100 px-2 py-0.5 rounded-md text-xs">
                    <strong>{localStats.vocabCount}</strong> {t('settings.vocabCount', { count: '' })}
                  </span>
                  <span className="bg-ink-100 px-2 py-0.5 rounded-md text-xs">
                    <strong>{localStats.statsHistoryCount}</strong> {t('settings.historyCount', { count: '' })}
                  </span>
                </div>
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
                  className="h-9 px-3 rounded-md border border-ink-300 bg-white text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
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
                  className="h-9 px-3 rounded-md border border-ink-300 bg-white text-ink-800 hover:bg-ink-100 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default"
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
                    className="h-9 px-3 rounded-md border border-ink-300 bg-white text-ink-800 hover:bg-ink-100 font-medium cursor-pointer"
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
                  className="flex items-center gap-1.5 h-10 px-4 rounded-md bg-accent-700 hover:bg-accent-800 text-white text-sm font-medium transition-all active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                  <span>{t('settings.exportBackup')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-ink-100 hover:bg-ink-200 text-ink-800 text-xs font-semibold border border-ink-300 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-ink-600" />
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

          {/* Test Connection Button */}
          <div className="pt-2 border-t border-ink-200 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-ink-100 hover:bg-ink-200 text-ink-800 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? t('settings.testingBtn') : t('settings.testBtn')}</span>
            </button>

            {testResult && (
              <span
                className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                  testResult.success
                    ? 'text-ok-800 bg-ok-50 border border-ok-200'
                    : 'text-bad-800 bg-bad-50 border border-bad-200'
                }`}
              >
                {testResult.msg}
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-ink-100 border-t border-ink-200 flex items-center justify-between">
          <span className="text-xs text-ink-500">
            {t('settings.savedNotice')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-600 hover:text-ink-900 hover:bg-ink-200/60 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="h-10 px-4 text-sm font-medium bg-accent-700 hover:bg-accent-800 text-white rounded-md transition-all active:scale-95"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
    </Dialog>
  );
};
