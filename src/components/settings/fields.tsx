/** Form pieces shared by the AI services page: select styling, the key field, the endpoint field and its status badge. */
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { normalizeBaseUrl } from '../../services/ai/baseUrl';
import { normalizeAzureRegion } from '../../services/ai/providers/azure/region';
import { getProvider, providerRequiresKey } from '../../services/ai/providers';
import { getApiKey, type AppSettings } from '../../utils/appSettings';

export const selectClass =
  'w-full h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm text-ink-900 focus:outline-none focus:border-accent-600 cursor-pointer';
export const fieldLabel = 'block text-sm font-medium text-ink-800 mb-1';

export function useProviderNames() {
  const { t } = useTranslation();
  return {
    providerName: (id: string) => t(`providers.${id}`, { defaultValue: id }),
    modelName: (id: string) => t(`models.${id.replace(/\./g, '_')}.name`, { defaultValue: id }),
  };
}

interface KeyFieldProps {
  providerId: string;
  value: string;
  onChange: (value: string) => void;
}

/** The API key input for one provider, with where the key goes and where to get one. A local provider's is optional. */
export const KeyField = forwardRef<HTMLInputElement, KeyFieldProps>(({ providerId, value, onChange }, ref) => {
  const { t } = useTranslation();
  const { providerName } = useProviderNames();
  const name = providerName(providerId);
  const inputId = `key-${providerId}`;
  const requiresKey = providerRequiresKey(providerId);
  return (
    <div>
      <label htmlFor={inputId} className={fieldLabel}>
        {t(requiresKey ? 'settings.keyLabel' : 'settings.keyLabelOptional', { provider: name })}
      </label>
      <input
        id={inputId}
        ref={ref}
        type="password"
        autoComplete="off"
        placeholder={t('settings.customKeyPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm font-mono focus:outline-none focus:border-accent-600"
      />
      <p className="text-xs text-ink-500 mt-1 leading-relaxed">
        {t(requiresKey ? 'settings.keyPrivacy' : 'aiSettings.keylessHelp', { provider: name })}{' '}
        <a
          href={getProvider(providerId).info.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent-900 underline underline-offset-2"
        >
          {t(requiresKey ? 'settings.getKey' : 'settings.providerDocs', { provider: name })}
        </a>
      </p>
    </div>
  );
});
KeyField.displayName = 'KeyField';

interface BaseUrlFieldProps {
  providerId: string;
  /** The endpoint this provider calls when the field is empty. */
  defaultUrl: string;
  value: string;
  onChange: (value: string) => void;
}

/** The endpoint override for a provider that lets the learner choose one; empty keeps the provider's default. */
export function BaseUrlField({ providerId, defaultUrl, value, onChange }: BaseUrlFieldProps) {
  const { t } = useTranslation();
  const inputId = `base-url-${providerId}`;
  const valid = !value.trim() || !!normalizeBaseUrl(value);
  return (
    <div>
      <label htmlFor={inputId} className={fieldLabel}>
        {t('aiSettings.baseUrlLabel')}
      </label>
      <input
        id={inputId}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={defaultUrl}
        value={value}
        aria-invalid={!valid}
        aria-describedby={`${inputId}-help`}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-10 px-3 rounded-md bg-surface border border-ink-300 text-sm font-mono focus:outline-none focus:border-accent-600"
      />
      <p id={`${inputId}-help`} className={`text-xs mt-1 leading-relaxed ${valid ? 'text-ink-500' : 'text-bad-700'}`}>
        {t(valid ? 'aiSettings.baseUrlHelp' : 'aiSettings.invalidBaseUrl', { url: defaultUrl })}
      </p>
    </div>
  );
}

/** Azure's required region stays local beside its key; it is not an endpoint override. */
export function RegionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const valid = !value.trim() || !!normalizeAzureRegion(value);
  return (
    <div>
      <label htmlFor="assessment-region" className={fieldLabel}>
        {t('azureAssessment.regionLabel')}
      </label>
      <input
        id="assessment-region"
        required
        autoComplete="off"
        spellCheck={false}
        value={value}
        aria-invalid={!valid}
        aria-describedby="assessment-region-help"
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      />
      <p
        id="assessment-region-help"
        className={`h-20 overflow-y-auto text-xs mt-1 leading-relaxed ${valid ? 'text-ink-500' : 'text-bad-700'}`}
      >
        {t(valid ? 'azureAssessment.regionHelp' : 'azureAssessment.invalidRegion')}
      </p>
      <p className="text-xs text-ink-500 leading-relaxed">{t('azureAssessment.checkHelp')}</p>
    </div>
  );
}

/** "Key saved in this browser", "No key yet", or "No key needed", for the settings that are stored (not the draft). */
export function KeyBadge({ saved, providerId }: { saved: AppSettings; providerId: string }) {
  const { t } = useTranslation();
  const requiresKey = providerRequiresKey(providerId);
  return !requiresKey || getApiKey(saved, providerId) ? (
    <span className="text-ok-800 flex items-center gap-1 text-xs">
      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{t(requiresKey ? 'settings.keySet' : 'settings.keyNotNeeded')}</span>
    </span>
  ) : (
    <span className="text-ink-500 flex items-center gap-1 text-xs">
      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{t('settings.keyMissing')}</span>
    </span>
  );
}
