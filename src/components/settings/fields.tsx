/** Form pieces shared by the AI services page: select styling, the key field and its status badge. */
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { getProvider } from '../../services/ai/providers';
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

/** The API key input for one provider, with where the key goes and where to get one. */
export const KeyField = forwardRef<HTMLInputElement, KeyFieldProps>(({ providerId, value, onChange }, ref) => {
  const { t } = useTranslation();
  const { providerName } = useProviderNames();
  const name = providerName(providerId);
  const inputId = `key-${providerId}`;
  return (
    <div>
      <label htmlFor={inputId} className={fieldLabel}>
        {t('settings.keyLabel', { provider: name })}
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
        {t('settings.keyPrivacy', { provider: name })}{' '}
        <a
          href={getProvider(providerId).info.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent-900 underline underline-offset-2"
        >
          {t('settings.getKey', { provider: name })}
        </a>
      </p>
    </div>
  );
});
KeyField.displayName = 'KeyField';

/** "Key saved in this browser" or "No key yet", for the settings that are stored (not the draft). */
export function KeyBadge({ saved, providerId }: { saved: AppSettings; providerId: string }) {
  const { t } = useTranslation();
  return getApiKey(saved, providerId) ? (
    <span className="text-ok-800 flex items-center gap-1 text-xs">
      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{t('settings.keySet')}</span>
    </span>
  ) : (
    <span className="text-ink-500 flex items-center gap-1 text-xs">
      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{t('settings.keyMissing')}</span>
    </span>
  );
}
