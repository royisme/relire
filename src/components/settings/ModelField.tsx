/** Model ID entry: native suggestions, provider discovery, and honest capability notes. */
import { useTranslation } from 'react-i18next';
import { normalizeModelId, purposeCapability } from '../../services/ai/catalogue';
import { getProvider } from '../../services/ai/providers';
import type { AiPurpose, ModelCapabilities, ModelInfo } from '../../services/ai/types';
import { getApiKey, type AppSettings } from '../../utils/appSettings';
import { Button } from '../ui/button';
import { fieldLabel, selectClass, useProviderNames } from './fields';
import type { useModelCatalogue } from './useModelCatalogue';

const UNKNOWN: ModelCapabilities = { textGeneration: 'unknown', imageInput: 'unknown', speechOutput: 'unknown' };

export function ModelField({
  draft,
  purpose,
  catalogue,
  onChange,
}: {
  draft: AppSettings;
  purpose: AiPurpose;
  catalogue: ReturnType<typeof useModelCatalogue>;
  onChange: (model: string) => void;
}) {
  const { t } = useTranslation();
  const { modelName } = useProviderNames();
  const provider = getProvider(draft[`${purpose}Provider`]);
  const model = draft[`${purpose}Model`];
  const key = getApiKey(draft, provider.info.id);
  const capabilities = (id: string) => provider.catalogue?.capabilities(id) ?? UNKNOWN;
  const defaults = (purpose === 'speech' ? provider.info.speech : provider.info.text)?.models ?? [];
  // Fetched entries carry the provider's own hints; the shipped list is only a starting point.
  const candidates: ModelInfo[] =
    catalogue.models ?? defaults.map((id) => ({ id, displayName: modelName(id), capabilities: capabilities(id) }));
  const level = purposeCapability(
    catalogue.models?.find((entry) => entry.id === model)?.capabilities ?? capabilities(model),
    purpose,
  );
  const absent = catalogue.models !== undefined && !catalogue.models.some((entry) => entry.id === model);
  const valid = !!normalizeModelId(model);
  /** What the last discovery attempt says: a real error, why it cannot run, or how many models came back. */
  const outcome = () => {
    if (catalogue.error) return { text: catalogue.error, failed: true };
    if (!key) return { text: t('aiSettings.fetchNeedsKey'), failed: false };
    if (!provider.catalogue) return { text: t('aiSettings.noDiscovery'), failed: false };
    if (!catalogue.models) return null;
    return {
      text: t(catalogue.models.length ? 'aiSettings.fetched' : 'aiSettings.empty', { count: catalogue.models.length }),
      failed: false,
    };
  };
  const status = outcome();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor="ai-model" className={fieldLabel}>
        {t('settings.modelLabel')}
      </label>
      <input
        id="ai-model"
        list="ai-models"
        autoComplete="off"
        spellCheck={false}
        value={model}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
        aria-describedby="ai-model-help"
      />
      <datalist id="ai-models">
        {candidates
          .filter((entry) => purposeCapability(entry.capabilities, purpose) !== 'unsupported')
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.displayName ?? entry.id}
            </option>
          ))}
      </datalist>
      <p id="ai-model-help" className={`text-xs leading-relaxed ${valid ? 'text-ink-600' : 'text-bad-700'}`}>
        {t(valid ? 'aiSettings.modelHelp' : 'aiSettings.invalidModel')}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => void catalogue.fetchModels()}
        disabled={!key || catalogue.loading || !provider.catalogue}
      >
        {t(
          catalogue.loading
            ? 'aiSettings.fetching'
            : catalogue.models !== undefined
              ? 'aiSettings.refresh'
              : 'aiSettings.fetch',
        )}
      </Button>
      <div role="status" className="min-h-10 text-sm break-words">
        {status && <p className={status.failed ? 'text-bad-700' : undefined}>{status.text}</p>}
        {absent && <p>{t('aiSettings.absent')}</p>}
      </div>
      <p className={`text-sm break-words ${level === 'unsupported' ? 'text-bad-700' : 'text-ink-600'}`}>
        {t(
          level === 'supported'
            ? 'aiSettings.capabilitySupported'
            : level === 'unknown'
              ? 'aiSettings.capabilityUnknown'
              : 'aiSettings.capabilityUnsupported',
        )}
      </p>
    </div>
  );
}
