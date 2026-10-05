import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Cpu, Key, RefreshCw, Sparkles, Volume2 } from 'lucide-react';
import { getProvider, speechProviders, textProviders } from '../../services/ai/providers';
import { getApiKey, type AppSettings } from '../../utils/appSettings';
import { testSpeech } from '../../utils/speech';

interface AiSectionProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  /** Shown when the dialog was opened because an AI feature needs a key. */
  needsKey?: boolean;
}

const select =
  'w-full px-3 py-2 rounded-md bg-ink-50 border border-ink-300 text-xs font-semibold text-ink-900 focus:outline-none focus:ring-2 focus:ring-accent-600 cursor-pointer';
const card = 'p-4 rounded-lg bg-white border border-ink-200 space-y-3';
const heading = 'text-xs font-semibold text-ink-900 flex items-center gap-1.5';

/** Settings: which provider and model write the answers, which one speaks them, and a key for each. */
export const AiSection: React.FC<AiSectionProps> = ({ settings, onChange, needsKey }) => {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  const name = (id: string) => t(`providers.${id}`, { defaultValue: id });
  const modelName = (id: string) => t(`models.${id.replace(/\./g, '_')}.name`, { defaultValue: id });
  const modelDesc = (id: string) => t(`models.${id.replace(/\./g, '_')}.desc`, { defaultValue: '' });

  const text = getProvider(settings.textProvider).info;
  const speech = getProvider(settings.speechProvider).info;
  const sameKey = settings.textProvider === settings.speechProvider;

  const setKey = (providerId: string, value: string) =>
    onChange({ ...settings, apiKeys: { ...settings.apiKeys, [providerId]: value } });

  // Changing a provider resets its model and voice to that provider's defaults.
  const pickTextProvider = (id: string) => {
    const info = getProvider(id).info.text!;
    onChange({ ...settings, textProvider: id, textModel: info.defaultModel });
  };
  const pickSpeechProvider = (id: string) => {
    const info = getProvider(id).info.speech!;
    onChange({ ...settings, speechProvider: id, speechModel: info.defaultModel, speechVoice: info.defaultVoice });
  };

  const keyField = (providerId: string) => {
    const info = getProvider(providerId).info;
    return (
      <div>
        <label className="block text-xs font-semibold text-ink-800 mb-1">
          {t('settings.keyLabel', { provider: name(providerId) })}
        </label>
        <input
          type="password"
          autoComplete="off"
          placeholder={t('settings.customKeyPlaceholder')}
          value={settings.apiKeys[providerId] ?? ''}
          onChange={(e) => setKey(providerId, e.target.value)}
          className="w-full px-3.5 py-2 rounded-md bg-ink-50 border border-ink-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-600 focus:bg-white"
        />
        <p className="text-xs text-ink-500 mt-1 leading-relaxed">
          {t('settings.keyPrivacy', { provider: name(providerId) })}{' '}
          <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-accent-700 underline underline-offset-2 hover:text-accent-900">
            {t('settings.getKey', { provider: name(providerId) })}
          </a>
        </p>
      </div>
    );
  };

  const keyBadge = (providerId: string) =>
    getApiKey(settings, providerId) ? (
      <span className="text-ok-800 bg-ok-50 border border-ok-200 flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{t('settings.keySet')}</span>
      </span>
    ) : (
      <span className="text-accent-800 bg-accent-50 border border-accent-200 flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{t('settings.keyMissing')}</span>
      </span>
    );

  // Plays a short phrase with the unsaved speech settings so a new provider, key or voice can be checked.
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await testSpeech(settings);
      setTestResult({ success: true, msg: t('settings.testSuccess') });
    } catch (err: any) {
      setTestResult({ success: false, msg: t('settings.testFailed', { msg: err.message || err }) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      {needsKey && (
        <p className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-900">
          {t('settings.needsKeyNotice')}
        </p>
      )}

      {/* Text provider: analysis, drills, pronunciation scoring */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className={heading}>
            <Key className="w-4 h-4 text-ink-600" />
            <span>{t('settings.textSection')}</span>
          </h4>
          {keyBadge(settings.textProvider)}
        </div>
        <div className={card}>
          <p className="text-xs text-ink-500">{t('settings.textSectionDesc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-ink-800 mb-1">{t('settings.providerLabel')}</span>
              <select className={select} value={settings.textProvider} onChange={(e) => pickTextProvider(e.target.value)}>
                {textProviders().map((p) => (
                  <option key={p.info.id} value={p.info.id}>
                    {name(p.info.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-800 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-ink-600" />
                {t('settings.modelLabel')}
              </span>
              <select className={select} value={settings.textModel} onChange={(e) => onChange({ ...settings, textModel: e.target.value })}>
                {text.text!.models.map((m) => (
                  <option key={m} value={m}>
                    {modelName(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {modelDesc(settings.textModel) && (
            <p className="text-xs text-accent-900 bg-accent-50 p-2 rounded-md border border-accent-200/60 leading-relaxed">
              {modelDesc(settings.textModel)}
            </p>
          )}
          {keyField(settings.textProvider)}
        </div>
      </section>

      {/* Speech provider: spoken French */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className={heading}>
            <Volume2 className="w-4 h-4 text-ink-600" />
            <span>{t('settings.speechSection')}</span>
          </h4>
          {!sameKey && keyBadge(settings.speechProvider)}
        </div>
        <div className={card}>
          <p className="text-xs text-ink-500">{t('settings.speechSectionDesc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-ink-800 mb-1">{t('settings.providerLabel')}</span>
              <select className={select} value={settings.speechProvider} onChange={(e) => pickSpeechProvider(e.target.value)}>
                {speechProviders().map((p) => (
                  <option key={p.info.id} value={p.info.id}>
                    {name(p.info.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-800 mb-1">
                <Cpu className="w-3.5 h-3.5 text-ink-600" />
                {t('settings.modelLabel')}
              </span>
              <select className={select} value={settings.speechModel} onChange={(e) => onChange({ ...settings, speechModel: e.target.value })}>
                {speech.speech!.models.map((m) => (
                  <option key={m} value={m}>
                    {modelName(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {modelDesc(settings.speechModel) && (
            <p className="text-xs text-ok-950 bg-ok-50 p-2 rounded-md border border-ok-200/60 leading-relaxed">
              {modelDesc(settings.speechModel)}
            </p>
          )}

          <div>
            <span className="block text-xs font-semibold text-ink-800 mb-1.5">{t('settings.voiceSection')}</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {speech.speech!.voices.map((v) => {
                const selected = settings.speechVoice === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange({ ...settings, speechVoice: v.id })}
                    className={`p-3 rounded-lg border text-left cursor-pointer ${
                      selected ? 'border-accent-700 bg-accent-50/80 ring-2 ring-accent-700/20' : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-ink-900">{v.id}</span>
                      <span className="text-xs px-1.5 rounded-md bg-ink-100 text-ink-600">
                        {v.gender === 'female' ? t('settings.female') : t('settings.male')}
                      </span>
                    </div>
                    <span className="text-xs text-ink-500 block truncate">{t(`voices.${v.id}`, { defaultValue: '' })}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {sameKey ? (
            <p className="text-xs text-ink-500">{t('settings.sameKeyNote', { provider: name(settings.speechProvider) })}</p>
          ) : (
            keyField(settings.speechProvider)
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="flex items-center gap-2 h-9 px-3 rounded-md bg-ink-100 hover:bg-ink-200 text-ink-800 text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? t('settings.testingBtn') : t('settings.testBtn')}</span>
            </button>
            {testResult && (
              <span className={`text-xs font-medium ${testResult.success ? 'text-ok-800' : 'text-bad-800'}`}>{testResult.msg}</span>
            )}
          </div>
        </div>
      </section>
    </>
  );
};
