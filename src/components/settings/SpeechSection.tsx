import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { getProvider, speechProviders } from '../../services/ai/providers';
import { errorMessage } from '../../services/ai/errors';
import type { AppSettings } from '../../utils/appSettings';
import { testSpeech } from '../../utils/speech';
import { useSaveStatus } from '../../hooks/useSaveStatus';
import { Button } from '../ui/button';
import { fieldLabel, KeyBadge, KeyField, selectClass, useProviderNames } from './fields';
import { SaveBar } from './SaveBar';
import { saveSlice, sliceOf } from './slices';

interface SpeechSectionProps {
  /** What the fields show (unsaved edits included) and what is stored. */
  draft: AppSettings;
  saved: AppSettings;
  onChange: (settings: AppSettings) => void;
  onSaved: (next: AppSettings) => void;
}

/** Settings → Speech: which provider, model and voice read French aloud. Saves on its own. */
export const SpeechSection: React.FC<SpeechSectionProps> = ({ draft, saved, onChange, onSaved }) => {
  const { t } = useTranslation();
  const { providerName, modelName, modelDesc } = useProviderNames();
  const { status, run, clear } = useSaveStatus();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);

  const speech = getProvider(draft.speechProvider).info.speech!;
  const sameKey = draft.speechProvider === draft.textProvider;
  const dirty = sliceOf(draft, 'speech') !== sliceOf(saved, 'speech');

  const edit = (next: AppSettings) => {
    clear();
    onChange(next);
  };
  // Changing the provider resets its model and voice to that provider's defaults.
  const pickProvider = (id: string) => {
    const info = getProvider(id).info.speech!;
    edit({ ...draft, speechProvider: id, speechModel: info.defaultModel, speechVoice: info.defaultVoice });
  };

  // Plays a short phrase with the unsaved speech settings so a new provider, key or voice can be checked.
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await testSpeech(draft);
      setTestResult({ success: true, msg: t('settings.testSuccess') });
    } catch (err) {
      setTestResult({ success: false, msg: t('settings.testFailed', { msg: errorMessage(err) }) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!sameKey && <KeyBadge saved={saved} providerId={saved.speechProvider} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={fieldLabel}>{t('settings.providerLabel')}</span>
          <select className={selectClass} value={draft.speechProvider} onChange={(e) => pickProvider(e.target.value)}>
            {speechProviders().map((p) => (
              <option key={p.info.id} value={p.info.id}>
                {providerName(p.info.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t('settings.modelLabel')}</span>
          <select
            className={selectClass}
            value={draft.speechModel}
            onChange={(e) => edit({ ...draft, speechModel: e.target.value })}
          >
            {speech.models.map((m) => (
              <option key={m} value={m}>
                {modelName(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {modelDesc(draft.speechModel) && (
        <p className="text-xs text-ink-500 leading-relaxed">{modelDesc(draft.speechModel)}</p>
      )}

      <div>
        <span className={fieldLabel}>{t('settings.voiceSection')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {speech.voices.map((v) => {
            const selected = draft.speechVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={selected}
                onClick={() => edit({ ...draft, speechVoice: v.id })}
                className={`p-3 rounded-lg border text-left cursor-pointer ${
                  selected
                    ? 'border-accent-700 bg-accent-50/80 ring-2 ring-accent-700/20'
                    : 'border-ink-200 bg-surface hover:border-ink-300'
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
        <p className="text-xs text-ink-500">
          {t('settings.sameKeyNote', { provider: providerName(draft.speechProvider) })}
        </p>
      ) : (
        <KeyField
          providerId={draft.speechProvider}
          value={draft.apiKeys[draft.speechProvider] ?? ''}
          onChange={(value) => edit({ ...draft, apiKeys: { ...draft.apiKeys, [draft.speechProvider]: value } })}
        />
      )}

      <SaveBar dirty={dirty} status={status} onSave={() => run(() => onSaved(saveSlice(draft, 'speech')))}>
        <Button type="button" variant="outline" onClick={runTest} disabled={testing}>
          <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {testing ? t('settings.testingBtn') : t('settings.testBtn')}
        </Button>
      </SaveBar>
      {/* The result of a test reads next to the button, in a slot that keeps its height. */}
      <div className="min-h-5 text-sm" role="status">
        {testResult && (
          <span className={`font-medium break-words ${testResult.success ? 'text-ok-800' : 'text-bad-700'}`}>
            {testResult.msg}
          </span>
        )}
      </div>
    </div>
  );
};
