import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF8F5] border border-amber-950/20 rounded-xl max-w-2xl w-full shadow-lg overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="p-5 bg-[#F4EFEA] border-b border-amber-900/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-700 text-white flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-french-serif text-lg font-bold text-stone-900">
                {t('settings.title')}
              </h3>
              <p className="text-xs text-stone-500">
                {t('settings.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          
          {/* SECTION 1: LLM Key & Deployment */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-700" />
                <span>{t('settings.apiKeySection')}</span>
              </h4>
              {/* Server Key Status Badge */}
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium border">
                {serverHasKey === null ? (
                  <span className="text-stone-400">{t('common.loading')}</span>
                ) : serverHasKey ? (
                  <span className="text-emerald-700 bg-emerald-50 border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('settings.envKeyReady')}</span>
                  </span>
                ) : (
                  <span className="text-amber-800 bg-amber-50 border-amber-200 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t('settings.envKeyMissing')}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 shadow-2xs">
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1">
                  {t('settings.customKeyLabel')}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={t('settings.customKeyPlaceholder')}
                    value={settings.customApiKey}
                    onChange={(e) => setSettings({ ...settings, customApiKey: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg bg-stone-50 border border-stone-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  {t('settings.customKeyDesc')}
                </p>
              </div>

              {/* Deployment hint */}
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200/80 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-stone-700 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-amber-700" />
                    <span>{t('settings.deployGuideTitle')}</span>
                  </span>
                  <button
                    onClick={copyEnvSnippet}
                    className="flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-950 font-mono"
                  >
                    {copiedEnv ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedEnv ? t('settings.copiedEnv') : t('settings.copyEnv')}</span>
                  </button>
                </div>
                <code className="block p-2 rounded bg-stone-900 text-emerald-300 font-mono text-[11px]">
                  GEMINI_API_KEY="AIzaSy..."
                </code>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  {t('settings.deployGuideDesc')}
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: Model Configuration */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-700" />
              <span>{t('settings.modelsSection')}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Analysis & Grammar Model */}
              <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  <span>{t('settings.analysisModelTitle')}</span>
                </div>
                <p className="text-[11px] text-stone-500">
                  {t('settings.analysisModelDesc')}
                </p>

                <select
                  value={settings.analysisModel}
                  onChange={(e) => setSettings({ ...settings, analysisModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 border border-stone-300 text-xs font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
                >
                  {AVAILABLE_ANALYSIS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isEn ? (m.nameEn || m.name) : m.name}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-md border border-amber-200/60 leading-relaxed">
                  {(() => {
                    const found = AVAILABLE_ANALYSIS_MODELS.find((m) => m.id === settings.analysisModel);
                    return isEn ? (found?.descEn || found?.desc) : found?.desc;
                  })()}
                </p>
              </div>

              {/* TTS Speech Model */}
              <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-2.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                  <Volume2 className="w-4 h-4 text-emerald-700" />
                  <span>{t('settings.ttsModelTitle')}</span>
                </div>
                <p className="text-[11px] text-stone-500">
                  {t('settings.ttsModelDesc')}
                </p>

                <select
                  value={settings.ttsModel}
                  onChange={(e) => setSettings({ ...settings, ttsModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-stone-50 border border-stone-300 text-xs font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
                >
                  {AVAILABLE_TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isEn ? (m.nameEn || m.name) : m.name}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-emerald-950 bg-emerald-50 p-2 rounded-md border border-emerald-200/60 leading-relaxed">
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
            <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-amber-700" />
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
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-700 bg-amber-50/80 ring-2 ring-amber-700/20 shadow-xs'
                        : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-stone-900">{v.id}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600">
                        {v.gender === 'female' ? t('settings.female') : t('settings.male')}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-500 block truncate">
                      {voiceSubtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: Local Offline Data Persistence & Backup */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-700" />
              <span>{t('settings.offlineSection')}</span>
            </h4>

            <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-stone-100 flex-wrap gap-2">
                <span className="text-stone-600">{t('settings.offlineSummary')}</span>
                <div className="flex items-center gap-2 sm:gap-3 font-medium text-stone-800 flex-wrap">
                  <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                    <strong>{localStats.articlesCount}</strong> {t('settings.articlesCount', { count: '' })}
                  </span>
                  <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                    <strong>{localStats.vocabCount}</strong> {t('settings.vocabCount', { count: '' })}
                  </span>
                  <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                    <strong>{localStats.statsHistoryCount}</strong> {t('settings.historyCount', { count: '' })}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-stone-500 leading-relaxed">
                {t('settings.offlineDesc')}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('settings.exportBackup')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold border border-stone-300 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-stone-600" />
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
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs font-medium text-stone-800">
                  {backupStatus}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 5: Language Selection (i18n) */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-stone-700" />
              <span>{t('settings.languageSection')}</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAppLanguage('en')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  i18n.language === 'en'
                    ? 'border-stone-700 bg-stone-100 ring-2 ring-stone-700/20 shadow-xs'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="font-bold text-xs text-stone-900">English</div>
                <div className="text-[11px] text-stone-500">{t('settings.langEn')}</div>
              </button>

              <button
                type="button"
                onClick={() => setAppLanguage('zh')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  i18n.language === 'zh'
                    ? 'border-stone-700 bg-stone-100 ring-2 ring-stone-700/20 shadow-xs'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="font-bold text-xs text-stone-900">简体中文</div>
                <div className="text-[11px] text-stone-500">{t('settings.langZh')}</div>
              </button>
            </div>
          </div>

          {/* Test Connection Button */}
          <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? t('settings.testingBtn') : t('settings.testBtn')}</span>
            </button>

            {testResult && (
              <span
                className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                  testResult.success
                    ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                    : 'text-rose-800 bg-rose-50 border border-rose-200'
                }`}
              >
                {testResult.msg}
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#F4EFEA] border-t border-amber-900/10 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            {t('settings.savedNotice')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 rounded-xl transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-xl shadow-xs transition-all active:scale-95"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
