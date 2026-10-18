/** The execution/access replacement point: only BYOK resolves purpose selections and credentials today.
 * A future backend replaces getAiAccess, not task prompts, validation or feature callers. No hosted mode exists.
 */
import i18n from '../../i18n';
import { getApiKey, getAppSettings, getBaseUrl, type AppSettings } from '../../utils/appSettings';
import { normalizeModelId } from './catalogue';
import { getProvider } from './providers';
import type { AiAccess, AiPurpose, AiSelection, SpeechConfig, SpeechSelection, TextPurpose } from './types';

/** Snapshot credentials in memory so later edits cannot redirect an already-consented request. Never persist it. */
export function createByokAccess(settings: AppSettings): AiAccess {
  const snapshot = { ...settings, apiKeys: { ...settings.apiKeys }, baseUrls: { ...settings.baseUrls } };
  const providerFor = (purpose: AiPurpose) => {
    const id = snapshot[`${purpose}Provider`];
    const provider = getProvider(id);
    if (provider.info.id !== id) throw new Error(i18n.t('errors.providerUnavailable', { provider: id }));
    return provider;
  };
  function selection(purpose: 'speech'): SpeechSelection;
  function selection(purpose: AiPurpose): AiSelection;
  function selection(purpose: AiPurpose): AiSelection | SpeechSelection {
    const provider = providerFor(purpose);
    const model = normalizeModelId(snapshot[`${purpose}Model`]);
    if (!model) throw new Error(i18n.t('errors.invalidModelId'));
    const selected: AiSelection = {
      providerId: provider.info.id,
      model,
      capabilities: provider.catalogue?.capabilities(model) ?? {
        textGeneration: 'unknown',
        imageInput: 'unknown',
        speechOutput: 'unknown',
      },
    };
    return purpose === 'speech' ? { ...selected, voice: snapshot.speechVoice } : selected;
  }
  const textConfig = (purpose: TextPurpose) => {
    const selected = selection(purpose);
    const baseUrl = getBaseUrl(snapshot, selected.providerId);
    // Absent means the provider's default endpoint; the snapshot keeps a later edit from redirecting a request.
    return { model: selected.model, apiKey: getApiKey(snapshot, selected.providerId), ...(baseUrl ? { baseUrl } : {}) };
  };
  const speechConfig = (): SpeechConfig => {
    const selected = selection('speech');
    const baseUrl = getBaseUrl(snapshot, selected.providerId);
    return {
      model: selected.model,
      apiKey: getApiKey(snapshot, selected.providerId),
      voice: snapshot.speechVoice,
      ...(baseUrl ? { baseUrl } : {}),
    };
  };
  return {
    isConfigured: (purpose) => !!getApiKey(snapshot, providerFor(purpose).info.id),
    selection,
    text(purpose) {
      const provider = providerFor(purpose).text;
      if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
      const config = textConfig(purpose);
      return {
        model: config.model,
        imageInput: provider.imageInputCapability(config.model),
        supportsAudioInput: provider.supportsAudioInput,
        generateJson: (request) => provider.generateJson(request, config),
      };
    },
    synthesize({ voice, ...request }) {
      const selected = selection('speech');
      const provider = providerFor('speech').speech;
      if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
      // Unknown is not unsupported: only the real synthesis call can confirm a custom model.
      if (selected.capabilities.speechOutput === 'unsupported')
        throw new Error(i18n.t('errors.speechOutputUnsupported', { model: selected.model }));
      return provider.synthesize(request, { ...speechConfig(), voice: voice || snapshot.speechVoice });
    },
    checkConnection(purpose) {
      const provider = providerFor(purpose).text;
      if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
      return provider.checkKey(textConfig(purpose));
    },
    listModels(purpose, signal) {
      const provider = providerFor(purpose);
      if (!provider.catalogue) throw new Error(i18n.t('errors.modelListUnavailable'));
      const key = getApiKey(snapshot, provider.info.id);
      return provider.catalogue.listModels(key, signal, getBaseUrl(snapshot, provider.info.id) || undefined);
    },
  };
}

export const getAiAccess = (settings: AppSettings = getAppSettings()): AiAccess => createByokAccess(settings);
