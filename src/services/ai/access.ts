/** The execution/access replacement point: only BYOK resolves purpose selections and credentials today.
 * A future backend replaces getAiAccess, not task prompts, validation or feature callers. No hosted mode exists.
 */
import i18n from '../../i18n';
import { getApiKey, getAppSettings, getBaseUrl, type AppSettings } from '../../utils/appSettings';
import { normalizeModelId } from './catalogue';
import { getProvider } from './providers';
import { normalizeAzureRegion } from './providers/azure/region';
import type { AiAccess, AiPurpose, AiSelection, SpeechConfig, SpeechSelection, TextPurpose } from './types';

/** Snapshot credentials in memory so later edits cannot redirect an already-consented request. Never persist it. */
export function createByokAccess(settings: AppSettings): AiAccess {
  const snapshot = {
    ...settings,
    apiKeys: { ...settings.apiKeys },
    baseUrls: { ...settings.baseUrls },
    providerRegions: { ...settings.providerRegions },
  };
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
    // The device voice is chosen by its provider alone: it has no model and no voice id to resolve.
    const deviceVoice = purpose === 'speech' && provider.info.speech?.device === true;
    const modelLess = deviceVoice || purpose === 'assessment';
    const model = modelLess ? '' : normalizeModelId(snapshot[`${purpose}Model`]);
    if (!model && !modelLess) throw new Error(i18n.t('errors.invalidModelId'));
    const selected: AiSelection = {
      providerId: provider.info.id,
      model: model ?? '',
      capabilities:
        purpose === 'assessment'
          ? {
              textGeneration: 'unsupported',
              imageInput: 'unsupported',
              speechOutput: 'unsupported',
            }
          : (provider.catalogue?.capabilities(model ?? '') ?? {
              textGeneration: 'unknown',
              imageInput: 'unknown',
              speechOutput: 'unknown',
            }),
    };
    return purpose === 'speech'
      ? { ...selected, voice: deviceVoice ? '' : snapshot.speechVoice, device: deviceVoice }
      : selected;
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
  const assessmentConfig = () => {
    const id = providerFor('assessment').info.id;
    return { apiKey: getApiKey(snapshot, id), region: snapshot.providerRegions[id] ?? '' };
  };
  return {
    // A local provider needs no key, so its features are ready as soon as it is selected.
    isConfigured: (purpose) => {
      const resolved = providerFor(purpose);
      const provider = resolved.info;
      if (purpose === 'assessment')
        return (
          !!resolved.assessment &&
          !!getApiKey(snapshot, provider.id) &&
          !!normalizeAzureRegion(snapshot.providerRegions[provider.id])
        );
      return provider.requiresKey === false || !!getApiKey(snapshot, provider.id);
    },
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
      // A device engine throws `DeviceVoiceError` here: it speaks directly and has no clip to return.
      return provider.synthesize(request, { ...speechConfig(), voice: voice || snapshot.speechVoice });
    },
    assess(request) {
      const provider = providerFor('assessment').assessment;
      if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
      return provider.assess(request, assessmentConfig());
    },
    checkConnection(purpose, signal) {
      if (purpose === 'assessment') {
        const provider = providerFor(purpose).assessment;
        if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
        return provider.checkKey(assessmentConfig(), signal);
      }
      const provider = providerFor(purpose).text;
      if (!provider) throw new Error(i18n.t('errors.purposeUnavailable'));
      return provider.checkKey(textConfig(purpose), signal);
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
