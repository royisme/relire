import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog } from './ui/overlay';
import { Button } from './ui/button';
import { checkTextKey } from '../services/api';
import { getProvider } from '../services/ai/providers';
import { getAppSettings, saveAppSettings } from '../utils/appSettings';

interface OnboardingDialogProps {
  /** Called when the guide ends, whether finished or skipped. */
  onClose: () => void;
  onKeySaved: () => void;
  /** Open the first article in the library; undefined when the library is empty. */
  onOpenSample?: () => void;
}

const STEPS = 3;

export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ onClose, onKeySaved, onOpenSample }) => {
  const { t } = useTranslation();
  const providerId = getAppSettings().textProvider;
  const providerName = t(`providers.${providerId}`, { defaultValue: providerId });
  const [step, setStep] = useState(0);
  const [key, setKey] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const verifyAndSave = async () => {
    setChecking(true);
    setError(null);
    try {
      const settings = getAppSettings();
      await checkTextKey(key.trim());
      saveAppSettings({ apiKeys: { ...settings.apiKeys, [settings.textProvider]: key.trim() } });
      setSaved(true);
      onKeySaved();
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const skip = (
    <button onClick={onClose} className="text-sm text-ink-500 hover:text-ink-900 underline underline-offset-2 cursor-pointer">
      {t('onboarding.skip')}
    </button>
  );

  return (
    <Dialog onClose={onClose} label={t('onboarding.label')} className="max-w-lg">
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent-700' : 'bg-ink-200'}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-xs text-ink-500 tnum">{t('onboarding.stepOf', { n: 1, total: STEPS })}</p>
            <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('onboarding.welcomeTitle')}</h2>
            <p className="text-sm text-ink-700 leading-relaxed">{t('onboarding.welcomeBody')}</p>
            <p className="text-sm text-ink-700 leading-relaxed">{t('onboarding.welcomeNeed', { provider: providerName })}</p>
            <div className="flex items-center justify-between pt-2">
              {skip}
              <Button onClick={() => setStep(1)}>{t('onboarding.next')}</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-ink-500 tnum">{t('onboarding.stepOf', { n: 2, total: STEPS })}</p>
            <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('onboarding.keyTitle', { provider: providerName })}</h2>
            <ol className="space-y-4 text-sm text-ink-700">
              <li className="space-y-2">
                <p>{t('onboarding.keyStep1', { provider: providerName })}</p>
                <a
                  href={getProvider(providerId).info.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-ink-300 bg-surface text-ink-800 hover:bg-ink-100 font-medium"
                >
                  {t('onboarding.openStudio', { provider: providerName })}
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </li>
              <li className="space-y-2">
                <label htmlFor="onboarding-key">{t('onboarding.keyStep2')}</label>
                <input
                  id="onboarding-key"
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                  placeholder={t('settings.customKeyPlaceholder')}
                  className="w-full h-10 px-3 text-sm font-mono bg-surface rounded-md border border-ink-300 focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
                />
                {error && (
                  <p role="alert" className="text-xs text-bad-700 break-words">
                    {t('onboarding.keyInvalid')} {error}
                  </p>
                )}
                <p className="text-xs text-ink-500">{t('settings.keyPrivacy', { provider: providerName })}</p>
              </li>
            </ol>
            <div className="flex items-center justify-between pt-2">
              {skip}
              <Button onClick={verifyAndSave} disabled={!key.trim() || checking}>
                {checking && <Loader2 className="w-4 h-4 animate-spin" />}
                {checking ? t('onboarding.checking') : t('onboarding.checkSave')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-ink-500 tnum">{t('onboarding.stepOf', { n: 3, total: STEPS })}</p>
            <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('onboarding.tryTitle')}</h2>
            {saved && (
              <p className="inline-flex items-center gap-1.5 text-sm text-ok-800">
                <CheckCircle2 className="w-4 h-4" />
                {t('onboarding.keySaved')}
              </p>
            )}
            <ul className="space-y-3 text-sm text-ink-700 leading-relaxed">
              <li>{t('onboarding.tipWord')}</li>
              <li>{t('onboarding.tipSentence')}</li>
              <li>{t('onboarding.tipSpeak')}</li>
            </ul>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>
                {t('onboarding.toLibrary')}
              </Button>
              {onOpenSample && (
                <Button
                  onClick={() => {
                    onOpenSample();
                    onClose();
                  }}
                >
                  {t('onboarding.openSample')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
