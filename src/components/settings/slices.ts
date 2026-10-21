/** AI selections, shared provider credentials and endpoints save together, independently of Practice. */
import i18n from '../../i18n';
import { normalizeBaseUrl } from '../../services/ai/baseUrl';
import { normalizeModelId } from '../../services/ai/catalogue';
import { getProvider } from '../../services/ai/providers';
import { getAppSettings, saveAppSettings, type AppSettings, type SpeechChoice } from '../../utils/appSettings';

export type SettingsSlice = 'ai' | 'practice';

const AI_MODEL_FIELDS = ['textModel', 'ocrModel', 'speechModel'] as const;

/** The models storage must be able to keep. A device speech engine has no model, so its empty one is no refusal. */
const aiModelFields = (draft: AppSettings) =>
  getProvider(draft.speechProvider).info.speech?.device ? (['textModel', 'ocrModel'] as const) : AI_MODEL_FIELDS;

/** saveAppSettings stores the canonical ID, so the draft is written canonicalized or the read-back never matches. */
const canonicalModel = (id: string) => normalizeModelId(id) ?? id;
/** Same for an endpoint: storage trims it and drops an unusable one, so the draft is written that way. */
const canonicalBaseUrl = (url: string) => normalizeBaseUrl(url) ?? '';

/** The providers the AI slice holds: every purpose's provider, saved once each. */
const usedProviders = (from: AppSettings) => [from.textProvider, from.ocrProvider, from.speechProvider];

/** An empty endpoint means the provider's default; anything nonempty must be a usable address. */
const baseUrlRefused = (url: string) => !!url.trim() && !normalizeBaseUrl(url);

/** Every engine's last model and voice, the selected engine's entry being its current choice. */
const speechChoicesOf = (from: AppSettings): Record<string, SpeechChoice> => ({
  ...from.speechChoices,
  [from.speechProvider]: { model: canonicalModel(from.speechModel), voice: from.speechVoice.trim() },
});

/**
 * A remembered engine's model or voice that storage would silently replace: refused with that field's own
 * message, like the current selection. The selected engine is checked by the rules above instead.
 */
function rememberedRefusal(draft: AppSettings): string | null {
  for (const [id, choice] of Object.entries(draft.speechChoices)) {
    if (id === draft.speechProvider) continue;
    const provider = getProvider(id);
    if (provider.info.speech?.device) continue;
    if (!normalizeModelId(choice.model)) return i18n.t('aiSettings.modelNotValid');
    const voice = choice.voice.trim();
    if (voice && provider.speech?.acceptsVoice && !provider.speech.acceptsVoice(voice))
      return i18n.t('aiSettings.voiceNotValid');
  }
  return null;
}

/** A provider with its own voice check refuses a voice it cannot take; a fixed list is its own proof. */
const voiceRefused = (draft: AppSettings) => {
  const speech = getProvider(draft.speechProvider).speech;
  const voice = draft.speechVoice.trim();
  return !!voice && !!speech?.acceptsVoice && !speech.acceptsVoice(voice);
};

export function sliceOf(settings: AppSettings, slice: SettingsSlice): string {
  if (slice === 'practice')
    return JSON.stringify([
      settings.practiceStrictAccents,
      settings.practiceDictationSpeed,
      settings.practiceSpeakAfterCheck,
      settings.practiceRemoteAutoSpeak,
      settings.practiceBrowserRecognition,
    ]);
  const providers = [...new Set(usedProviders(settings))].sort();
  return JSON.stringify([
    settings.textProvider,
    settings.textModel,
    settings.ocrProvider,
    settings.ocrModel,
    settings.speechProvider,
    settings.speechModel,
    settings.speechVoice,
    speechChoicesOf(settings),
    providers.map((id) => [id, settings.apiKeys[id] ?? '']),
    providers.map((id) => [id, settings.baseUrls[id] ?? '']),
  ]);
}

export function withSlice(base: AppSettings, from: AppSettings, slice: SettingsSlice): AppSettings {
  if (slice === 'practice')
    return {
      ...base,
      practiceStrictAccents: from.practiceStrictAccents,
      practiceDictationSpeed: from.practiceDictationSpeed,
      practiceSpeakAfterCheck: from.practiceSpeakAfterCheck,
      practiceRemoteAutoSpeak: from.practiceRemoteAutoSpeak,
      practiceBrowserRecognition: from.practiceBrowserRecognition,
    };
  const providers = usedProviders(from);
  return {
    ...base,
    textProvider: from.textProvider,
    textModel: canonicalModel(from.textModel),
    ocrProvider: from.ocrProvider,
    ocrModel: canonicalModel(from.ocrModel),
    speechProvider: from.speechProvider,
    speechModel: canonicalModel(from.speechModel),
    speechVoice: from.speechVoice.trim(),
    speechChoices: Object.fromEntries(
      Object.entries(speechChoicesOf(from)).map(([id, choice]) => [
        id,
        { model: canonicalModel(choice.model), voice: choice.voice.trim() },
      ]),
    ),
    apiKeys: { ...base.apiKeys, ...Object.fromEntries(providers.map((id) => [id, from.apiKeys[id] ?? ''])) },
    baseUrls: {
      ...base.baseUrls,
      ...Object.fromEntries(providers.map((id) => [id, canonicalBaseUrl(from.baseUrls[id] ?? '')])),
    },
  };
}

/** Read back because saveAppSettings catches storage errors. Never mark a failed write as saved. */
export function saveSlice(draft: AppSettings, slice: SettingsSlice): AppSettings {
  // A model ID storage cannot keep would be silently replaced by the provider default: refuse the whole save.
  if (slice === 'ai' && aiModelFields(draft).some((field) => !normalizeModelId(draft[field])))
    throw new Error(i18n.t('aiSettings.modelNotValid'));
  // Same for an address storage would drop: the learner would silently go back to the provider's host.
  if (slice === 'ai' && usedProviders(draft).some((id) => baseUrlRefused(draft.baseUrls[id] ?? '')))
    throw new Error(i18n.t('aiSettings.baseUrlNotValid'));
  // And for a voice the provider would refuse: storage would silently replace it with the default.
  if (slice === 'ai' && voiceRefused(draft)) throw new Error(i18n.t('aiSettings.voiceNotValid'));
  // A remembered choice for another engine follows the same rules.
  const remembered = slice === 'ai' ? rememberedRefusal(draft) : null;
  if (remembered) throw new Error(remembered);
  const intended = withSlice(getAppSettings(), draft, slice);
  const next = saveAppSettings(intended);
  if (sliceOf(getAppSettings(), slice) !== sliceOf(intended, slice)) throw new Error(i18n.t('settings.notStored'));
  return next;
}
