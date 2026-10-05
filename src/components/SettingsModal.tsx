import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, OverlayHeader } from './ui/overlay';
import {
  X, Settings, Key, Cpu, Volume2, ShieldCheck, CheckCircle2,
  AlertCircle, HelpCircle, RefreshCw, Sparkles, Server, Terminal, Copy, Check,
  Download, Upload, Database, HardDrive, Trash2, Globe
} from 'lucide-react';
import {
  AppSettings, getAppSettings, saveAppSettings,
  AVAILABLE_ANALYSIS_MODELS, AVAILABLE_TTS_MODELS, AVAILABLE_VOICES
} from '../utils/appSettings';
import { setAppLanguage } from '../i18n';
import { speakFrench } from '../utils/frenchSpeech';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());
  const [serverHasKey, setServerHasKey] = useState<boolean | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
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

      // Check server env key status
      fetch('/api/config')
        .then((r) => r.json())
        .then((d) => setServerHasKey(!!d.hasEnvKey))
        .catch(() => setServerHasKey(false));

      // Calculate local data size
      try {
        const rawArticles = localStorage.getItem('eclair_articles_v1');
        const rawVocab = localStorage.getItem('eclair_vocab_v1');
        const rawStats = localStorage.getItem('eclair_stats_v1');
        setLocalStats({
          articlesCount: rawArticles ? JSON.parse(rawArticles).length : 0,
          vocabCount: rawVocab ? JSON.parse(rawVocab).length : 0,
          statsHistoryCount: rawStats ? (JSON.parse(rawStats).pronunciationHistory?.length || 0) : 0,
        });
      } catch (e) {
        console.error('Failed to read local stats', e);
      }
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

  // Export all application data into a single JSON file
  const handleExportData = () => {
    try {
      const backupData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        settings: getAppSettings(),
        articles: JSON.parse(localStorage.getItem('eclair_articles_v1') || '[]'),
        vocab: JSON.parse(localStorage.getItem('eclair_vocab_v1') || '[]'),
        stats: JSON.parse(localStorage.getItem('eclair_stats_v1') || '{}'),
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eclair-francais-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupStatus(t('settings.exportSuccess'));
    } catch (err: any) {
      setBackupStatus(`Export failed: ${err.message || err}`);
    }
  };

  // Import application data from JSON file
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (data.articles && Array.isArray(data.articles)) {
          localStorage.setItem('eclair_articles_v1', JSON.stringify(data.articles));
        }
        if (data.vocab && Array.isArray(data.vocab)) {
          localStorage.setItem('eclair_vocab_v1', JSON.stringify(data.vocab));
        }
        if (data.stats && typeof data.stats === 'object') {
          localStorage.setItem('eclair_stats_v1', JSON.stringify(data.stats));
        }
        if (data.settings && typeof data.settings === 'object') {
          saveAppSettings(data.settings);
          setSettings(getAppSettings());
        }

        setBackupStatus(t('settings.importSuccess'));
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        setBackupStatus(`Restore failed: (${err.message || err})`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.customApiKey?.trim()) {
        headers['x-gemini-api-key'] = settings.customApiKey.trim();
      }

      // Test TTS audio generation
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: 'Bonjour ! Bienvenue sur Éclair Français.',
          voice: settings.ttsVoice,
          model: settings.ttsModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        throw new Error(err.error || 'Test failed');
      }

      setTestResult({
        success: true,
        msg: t('settings.testSuccess'),
      });

      // Play test speech
      speakFrench('Bonjour ! Bienvenue sur Éclair Français.', {
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

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText('GEMINI_API_KEY="your_api_key_here"\nPORT=3000');
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  return (
    <Dialog onClose={onClose} label={t('settings.title')}>
        <OverlayHeader title={t('settings.title')} subtitle={t('settings.subtitle')} onClose={onClose} closeLabel={t('common.close')} />

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          
          {/* SECTION 1: LLM Key & Deployment */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-ink-600" />
                <span>{t('settings.apiKeySection')}</span>
              </h4>
              {/* Server Key Status Badge */}
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border">
                {serverHasKey === null ? (
                  <span className="text-ink-400">{t('common.loading')}</span>
                ) : serverHasKey ? (
                  <span className="text-ok-700 bg-ok-50 border-ok-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ok-600" />
                    <span>{t('settings.envKeyReady')}</span>
                  </span>
                ) : (
                  <span className="text-accent-800 bg-accent-50 border-accent-200 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-accent-600" />
                    <span>{t('settings.envKeyMissing')}</span>
                  </span>
                )}
              </div>
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

              {/* Deployment hint */}
              <div className="p-3 rounded-md bg-ink-50 border border-ink-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-ink-700 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-ink-600" />
                    <span>{t('settings.deployGuideTitle')}</span>
                  </span>
                  <button
                    onClick={copyEnvSnippet}
                    className="flex items-center gap-1 text-xs text-accent-800 hover:text-accent-950 font-mono"
                  >
                    {copiedEnv ? <Check className="w-3 h-3 text-ok-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedEnv ? t('settings.copiedEnv') : t('settings.copyEnv')}</span>
                  </button>
                </div>
                <code className="block p-2 rounded-md bg-ink-900 text-ok-300 font-mono text-xs">
                  GEMINI_API_KEY="AIzaSy..."
                </code>
                <p className="text-xs text-ink-500 leading-relaxed">
                  {t('settings.deployGuideDesc')}
                </p>
              </div>
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
                      {isEn ? (m.nameEn || m.name) : m.name}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-accent-900 bg-accent-50 p-2 rounded-md border border-accent-200/60 leading-relaxed">
                  {(() => {
                    const found = AVAILABLE_ANALYSIS_MODELS.find((m) => m.id === settings.analysisModel);
                    return isEn ? (found?.descEn || found?.desc) : found?.desc;
                  })()}
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
                      {isEn ? (m.nameEn || m.name) : m.name}
                    </option>
                  ))}
                </select>

                <p className="text-xs text-ok-950 bg-ok-50 p-2 rounded-md border border-ok-200/60 leading-relaxed">
                  {(() => {
                    const found = AVAILABLE_TTS_MODELS.find((m) => m.id === settings.ttsModel);
                    return isEn ? (found?.descEn || found?.desc) : found?.desc;
                  })()}
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
                const voiceName = isEn ? (v.nameEn || v.name) : v.name;
                const voiceSubtitle = voiceName.split('·')[1]?.replace(')', '') || (isEn ? 'Standard French' : '标准母语法语');
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
                      {voiceSubtitle}
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

          {/* SECTION 5: Language Selection (i18n) */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-semibold text-ink-900 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-ink-700" />
              <span>{t('settings.languageSection')}</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAppLanguage('en')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  i18n.language === 'en'
                    ? 'border-ink-700 bg-ink-100 ring-2 ring-ink-700/20 '
                    : 'border-ink-200 bg-white hover:border-ink-300'
                }`}
              >
                <div className="font-semibold text-xs text-ink-900">English</div>
                <div className="text-xs text-ink-500">{t('settings.langEn')}</div>
              </button>

              <button
                type="button"
                onClick={() => setAppLanguage('zh')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  i18n.language === 'zh'
                    ? 'border-ink-700 bg-ink-100 ring-2 ring-ink-700/20 '
                    : 'border-ink-200 bg-white hover:border-ink-300'
                }`}
              >
                <div className="font-semibold text-xs text-ink-900">简体中文</div>
                <div className="text-xs text-ink-500">{t('settings.langZh')}</div>
              </button>
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
